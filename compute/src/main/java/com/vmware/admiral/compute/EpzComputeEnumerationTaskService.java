/*
 * Copyright (c) 2016 VMware, Inc. All Rights Reserved.
 *
 * This product is licensed to you under the Apache License, Version 2.0 (the "License").
 * You may not use this product except in compliance with the License.
 *
 * This product may include a number of subcomponents with separate copyright notices
 * and license terms. Your use of these subcomponents is subject to the terms and
 * conditions of the subcomponent's license, as noted in the LICENSE file.
 */

package com.vmware.admiral.compute;

import static com.vmware.xenon.common.ServiceDocumentDescription.PropertyIndexingOption.STORE_ONLY;
import static com.vmware.xenon.common.ServiceDocumentDescription.PropertyUsageOption.AUTO_MERGE_IF_NOT_NULL;
import static com.vmware.xenon.common.ServiceDocumentDescription.PropertyUsageOption.REQUIRED;
import static com.vmware.xenon.common.ServiceDocumentDescription.PropertyUsageOption.SERVICE_USE;
import static com.vmware.xenon.common.ServiceDocumentDescription.PropertyUsageOption.SINGLE_ASSIGNMENT;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.logging.Level;
import java.util.stream.Collectors;

import com.vmware.admiral.common.ManagementUriParts;
import com.vmware.admiral.compute.EpzComputeEnumerationTaskService.EpzComputeEnumerationTaskState;
import com.vmware.admiral.service.common.AbstractTaskStatefulService;
import com.vmware.admiral.service.common.TaskServiceDocument;
import com.vmware.photon.controller.model.resources.ComputeService.ComputeState;
import com.vmware.photon.controller.model.resources.ResourcePoolService.ResourcePoolState;
import com.vmware.photon.controller.model.resources.ResourceState;
import com.vmware.xenon.common.Operation;
import com.vmware.xenon.common.OperationJoin;
import com.vmware.xenon.common.Service;
import com.vmware.xenon.common.ServiceDocumentQueryResult;
import com.vmware.xenon.common.TaskState.TaskStage;
import com.vmware.xenon.common.UriUtils;
import com.vmware.xenon.common.Utils;
import com.vmware.xenon.services.common.QueryTask;
import com.vmware.xenon.services.common.QueryTask.Query;
import com.vmware.xenon.services.common.QueryTask.Query.Occurance;
import com.vmware.xenon.services.common.QueryTask.QuerySpecification;
import com.vmware.xenon.services.common.QueryTask.QuerySpecification.QueryOption;
import com.vmware.xenon.services.common.QueryTask.QueryTerm.MatchType;
import com.vmware.xenon.services.common.ServiceUriPaths;

/**
 * Task service that enumerates all computes participating in the given resource pool and updates
 * the resource pool links into their custom properties. This is helpful when the resource pool for
 * a compute is needed - executing all query-driven resource pools would be a time-consuming
 * operation.
 */
public class EpzComputeEnumerationTaskService extends
        AbstractTaskStatefulService<EpzComputeEnumerationTaskState,
                EpzComputeEnumerationTaskState.SubStage> {

    public static final String FACTORY_LINK = ManagementUriParts.EPZ_COMPUTE_ENUMERATION_TASKS;
    public static final String DISPLAY_NAME = "Elastic Placement Zone Compute Enumeration";

    // for each RP the compute participates in, a custom prop is created in form of:
    //   "__epz_[RP_GUID]" : "true"
    // this allows multiple RPs to patch the compute in parallel (instead of having all RPs into a
    // single custom property)
    public static final String EPZ_CUSTOM_PROP_NAME_PREFIX = "__epz_";
    public static final String EPZ_CUSTOM_PROP_VALUE = "true";

    private static final int COMPUTE_PAGE_SIZE = 16;

    /**
     * Task state associated with {@code EpzComputeEnumerationTaskService}.
     */
    public static class EpzComputeEnumerationTaskState
            extends TaskServiceDocument<EpzComputeEnumerationTaskState.SubStage> {

        public static enum SubStage {
            CREATED,
            QUERY_COMPUTES_TO_UNASSIGN,
            UNASSIGN_COMPUTES,
            QUERY_COMPUTES_TO_ASSIGN,
            ASSIGN_COMPUTES,
            COMPLETED,
            ERROR;
        }

        @Documentation(description = "Link to the resource pool which capacity to update.")
        @PropertyOptions(usage = { SINGLE_ASSIGNMENT, REQUIRED, AUTO_MERGE_IF_NOT_NULL },
                indexing = STORE_ONLY)
        public String resourcePoolLink;

        @Documentation(description = "Resource pool query.")
        @PropertyOptions(usage = { SERVICE_USE, AUTO_MERGE_IF_NOT_NULL },
                indexing = STORE_ONLY)
        public Query resourcePoolQuery;

        @Documentation(description = "Link to the next page of computes to unassign or assign.")
        @PropertyOptions(usage = { SERVICE_USE, AUTO_MERGE_IF_NOT_NULL },
                indexing = STORE_ONLY)
        public String nextPageLink;
    }

    public EpzComputeEnumerationTaskService() {
        super(EpzComputeEnumerationTaskState.class,
                EpzComputeEnumerationTaskState.SubStage.class, DISPLAY_NAME);
        super.toggleOption(ServiceOption.PERSISTENCE, true);
        super.toggleOption(ServiceOption.REPLICATION, true);
        super.toggleOption(ServiceOption.OWNER_SELECTION, true);
        super.toggleOption(ServiceOption.INSTRUMENTATION, true);
    }

    /**
     * Triggers the enumeration task for the given resource pool. Makes sure no multiple tasks are
     * run in parallel for the same resource pool.
     */
    public static void triggerForResourcePool(Service sender, String resourcePoolLink) {
        EpzComputeEnumerationTaskState task = new EpzComputeEnumerationTaskState();
        task.resourcePoolLink = resourcePoolLink;
        task.documentSelfLink = extractRpId(task);

        Operation.createPost(sender.getHost(), EpzComputeEnumerationTaskService.FACTORY_LINK)
                .addPragmaDirective(Operation.PRAGMA_DIRECTIVE_FORCE_INDEX_UPDATE)
                .setBody(task)
                .setCompletion((o, e) -> {
                    if (o.getStatusCode() == Operation.STATUS_CODE_CONFLICT) {
                        sender.getHost().log(Level.INFO,
                                "Enumeration task already running for " + resourcePoolLink);
                        return;
                    }

                    if (e != null) {
                        sender.getHost().log(Level.WARNING,
                                "Failed to start enumeration task for %s: %s", resourcePoolLink,
                                e.getMessage());
                        return;
                    }

                    sender.getHost().log(Level.INFO,
                            "Started enumeration task for " + resourcePoolLink);
                }).sendWith(sender);

    }

    @Override
    protected void validateStateOnStart(EpzComputeEnumerationTaskState state)
            throws IllegalArgumentException {
        // validate based on annotations
        Utils.validateState(getStateDescription(), state);
    }

    @Override
    protected boolean validateStageTransition(Operation patch,
            EpzComputeEnumerationTaskState patchBody, EpzComputeEnumerationTaskState currentState) {
        // use default merging for AUTO_MERGE_IF_NOT_NULL fields
        Utils.mergeWithState(getStateDescription(), currentState, patchBody);
        return false;
    }

    @Override
    protected void handleStagePatch(EpzComputeEnumerationTaskState state) {
        super.handleStagePatch(state);

        // this is a one-off task, self delete finished/cancelled/failed
        if (state.taskInfo.stage.ordinal() > TaskStage.STARTED.ordinal()) {
            sendSelfDelete();
        }
    }

    @Override
    protected void handleStartedStagePatch(EpzComputeEnumerationTaskState state) {
        switch (state.taskSubStage) {
        case CREATED:
            retrieveResourcePoolState(state);
            break;
        case QUERY_COMPUTES_TO_UNASSIGN:
            queryComputesToUnassign(state);
            break;
        case UNASSIGN_COMPUTES:
            updateComputes(state, false);
            break;
        case QUERY_COMPUTES_TO_ASSIGN:
            queryComputesToAssign(state);
            break;
        case ASSIGN_COMPUTES:
            updateComputes(state, true);
            break;
        case COMPLETED:
            complete(state, state.taskSubStage);
            break;
        case ERROR:
            completeWithError(state, state.taskSubStage);
            break;
        default:
            break;
        }
    }

    private void retrieveResourcePoolState(EpzComputeEnumerationTaskState state) {
        sendRequest(Operation.createGet(getHost(), state.resourcePoolLink).setCompletion((o, e) -> {
            if (e != null) {
                failTask(String.format("Error retrieving resource pool %s",
                        state.resourcePoolLink), e);
                return;
            }

            EpzComputeEnumerationTaskState newState = createUpdateSubStageTask(state,
                    EpzComputeEnumerationTaskState.SubStage.QUERY_COMPUTES_TO_UNASSIGN);
            newState.resourcePoolQuery = o.getBody(ResourcePoolState.class).query;
            sendSelfPatch(newState);
        }));
    }

    private void queryComputesToUnassign(EpzComputeEnumerationTaskState state) {
        Query mustBeOut = Utils.clone(state.resourcePoolQuery)
                .setOccurance(Occurance.MUST_NOT_OCCUR);
        Query areIn = Query.Builder.create()
                .addKindFieldClause(ComputeState.class)
                .addCompositeFieldClause(ResourceState.FIELD_NAME_CUSTOM_PROPERTIES,
                        EPZ_CUSTOM_PROP_NAME_PREFIX + extractRpId(state), EPZ_CUSTOM_PROP_VALUE)
                .build();

        Query combinedQuery = Query.Builder.create().addClauses(mustBeOut, areIn).build();
        queryComputes(state, combinedQuery,
                EpzComputeEnumerationTaskState.SubStage.UNASSIGN_COMPUTES,
                EpzComputeEnumerationTaskState.SubStage.QUERY_COMPUTES_TO_ASSIGN);
    }

    private void queryComputesToAssign(EpzComputeEnumerationTaskState state) {
        Query mustBeIn = Utils.clone(state.resourcePoolQuery);
        Query areOut = Query.Builder.create()
                .addKindFieldClause(ComputeState.class)
                .addFieldClause(
                        QuerySpecification.buildCompositeFieldName(
                                ResourceState.FIELD_NAME_CUSTOM_PROPERTIES,
                                EPZ_CUSTOM_PROP_NAME_PREFIX + extractRpId(state)),
                        EPZ_CUSTOM_PROP_VALUE,
                        MatchType.TERM,
                        Occurance.MUST_NOT_OCCUR)
                .build();

        Query combinedQuery = Query.Builder.create().addClauses(mustBeIn, areOut).build();
        queryComputes(state, combinedQuery, EpzComputeEnumerationTaskState.SubStage.ASSIGN_COMPUTES,
                EpzComputeEnumerationTaskState.SubStage.COMPLETED);
    }

    private void queryComputes(EpzComputeEnumerationTaskState state, Query computeQuery,
            EpzComputeEnumerationTaskState.SubStage updateStage,
            EpzComputeEnumerationTaskState.SubStage nextStage) {
        QueryTask task = QueryTask.Builder.createDirectTask().setQuery(computeQuery)
                .setResultLimit(COMPUTE_PAGE_SIZE).addOption(QueryOption.EXPAND_CONTENT).build();

        sendRequest(Operation
                .createPost(this, ServiceUriPaths.CORE_QUERY_TASKS)
                .setBody(task)
                .setCompletion((o, e) -> {
                    if (e != null) {
                        failTask("Error quering for computes", e);
                        return;
                    }

                    ServiceDocumentQueryResult result = o.getBody(QueryTask.class).results;
                    EpzComputeEnumerationTaskState newState;
                    if (result.nextPageLink == null) {
                        logInfo("No computes found to %s resource pool %s",
                                updateStage == EpzComputeEnumerationTaskState.SubStage.ASSIGN_COMPUTES
                                        ? "assign to" : "unassign from",
                                state.resourcePoolLink);
                        newState = createUpdateSubStageTask(state, nextStage);
                    } else {
                        newState = createUpdateSubStageTask(state, updateStage);
                        newState.nextPageLink = result.nextPageLink;
                    }
                    sendSelfPatch(newState);
                }));
    }

    private void updateComputes(EpzComputeEnumerationTaskState state, boolean assign) {
        sendRequest(Operation
                .createGet(getHost(), state.nextPageLink)
                .setCompletion((o, e) -> {
                    if (e != null) {
                        failTask("Error retrieving computes", e);
                        return;
                    }
                    updateComputes(state, o.getBody(QueryTask.class).results, assign, assign
                            ? EpzComputeEnumerationTaskState.SubStage.COMPLETED
                            : EpzComputeEnumerationTaskState.SubStage.QUERY_COMPUTES_TO_ASSIGN);
                }));
    }

    private void updateComputes(EpzComputeEnumerationTaskState state,
            ServiceDocumentQueryResult result, boolean assign,
            EpzComputeEnumerationTaskState.SubStage nextStage) {
        List<ComputeState> computes = result.documents.values().stream()
                .map(json -> Utils.fromJson(json, ComputeState.class)).collect(Collectors.toList());

        if (computes.isEmpty()) {
            logWarning("Empty compute page returned, nothing to %s", assign ? "assign" : "unassign");
            sendSelfPatch(createUpdateSubStageTask(state, nextStage));
            return;
        }

        logInfo("Resource pool %s: %s %d computes, %s", state.resourcePoolLink,
                assign ? "assigning" : "unassigning", computes.size(),
                result.nextPageLink != null ? "there are more pages" : "no more pages");

        List<Operation> patchOps = new ArrayList<>(computes.size());
        for (ComputeState compute : computes) {
            ComputeState patchBody = new ComputeState();
            patchBody.customProperties = new HashMap<>();
            patchBody.customProperties.put(EPZ_CUSTOM_PROP_NAME_PREFIX + extractRpId(state),
                    assign ? EPZ_CUSTOM_PROP_VALUE : null);
            patchOps.add(
                    Operation.createPatch(getHost(), compute.documentSelfLink).setBody(patchBody));
        }

        OperationJoin.create(patchOps).setCompletion((ops, exs) -> {
            if (exs != null) {
                failTask("Error updating computes", exs.values().iterator().next());
                return;
            }

            EpzComputeEnumerationTaskState newState;
            if (result.nextPageLink == null) {
                newState = createUpdateSubStageTask(state, nextStage);
            } else {
                newState = createUpdateSubStageTask(state, state.taskSubStage);
                newState.nextPageLink = result.nextPageLink;
            }
            sendSelfPatch(newState);
        }).sendWith(this);
    }

    private static String extractRpId(EpzComputeEnumerationTaskState state) {
        return UriUtils.getLastPathSegment(state.resourcePoolLink);
    }
}
