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

package com.vmware.admiral.request.allocation.filter;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Map.Entry;
import java.util.TreeMap;
import java.util.logging.Level;
import java.util.stream.Collectors;

import com.vmware.admiral.common.util.QueryUtil;
import com.vmware.admiral.common.util.ServiceDocumentQuery;
import com.vmware.admiral.compute.container.CompositeComponentFactoryService;
import com.vmware.admiral.compute.container.ContainerDescriptionService.ContainerDescription;
import com.vmware.admiral.compute.container.ServiceNetwork;
import com.vmware.admiral.compute.container.network.ContainerNetworkDescriptionService.ContainerNetworkDescription;
import com.vmware.admiral.compute.container.network.ContainerNetworkService.ContainerNetworkState;
import com.vmware.admiral.request.PlacementHostSelectionTaskService;
import com.vmware.admiral.request.PlacementHostSelectionTaskService.PlacementHostSelectionTaskState;
import com.vmware.admiral.request.utils.RequestUtils;
import com.vmware.xenon.common.ServiceHost;
import com.vmware.xenon.common.UriUtils;
import com.vmware.xenon.services.common.QueryTask;

/**
 * A filter implementing {@link HostSelectionFilter} in order to provide affinity and network name
 * resolution in case the {@link ContainerDescription} specifies <code>networks</code> property.
 */
public class ContainerToNetworkAffinityHostFilter
        implements HostSelectionFilter<PlacementHostSelectionTaskState> {
    private final Map<String, ServiceNetwork> networks;
    private final ServiceHost host;

    private static final String NO_KV_STORE = "NONE";

    public ContainerToNetworkAffinityHostFilter(ServiceHost host, ContainerDescription desc) {
        this.host = host;
        this.networks = desc.networks;
    }

    @Override
    public void filter(
            PlacementHostSelectionTaskService.PlacementHostSelectionTaskState state,
            Map<String, HostSelection> hostSelectionMap,
            HostSelectionFilterCompletion callback) {
        // sort the map in order to return consistent result no matter the order
        Map<String, HostSelection> sortedHostSelectionMap;
        if (hostSelectionMap != null) {
            sortedHostSelectionMap = new TreeMap<>(hostSelectionMap);
        } else {
            sortedHostSelectionMap = null;
        }

        if (isActive()) {
            findComponentDescriptions(state, sortedHostSelectionMap, callback);
        } else {
            callback.complete(sortedHostSelectionMap, null);
        }
    }

    protected void findComponentDescriptions(final PlacementHostSelectionTaskState state,
            final Map<String, HostSelection> hostSelectionMap,
            final HostSelectionFilterCompletion callback) {

        final QueryTask q = QueryUtil.buildQuery(ContainerNetworkDescription.class, false);

        QueryUtil.addListValueClause(q, ContainerNetworkDescription.FIELD_NAME_NAME,
                networks.keySet());
        QueryUtil.addExpandOption(q);

        final Map<String, DescName> descLinksWithNames = new HashMap<>();
        new ServiceDocumentQuery<>(host, ContainerNetworkDescription.class)
                .query(q, (r) -> {
                    if (r.hasException()) {
                        host.log(Level.WARNING,
                                "Exception while filtering network descriptions. Error: [%s]",
                                r.getException().getMessage());
                        callback.complete(null, r.getException());
                    } else if (r.hasResult()) {
                        final ContainerNetworkDescription desc = r.getResult();
                        final DescName descName = new DescName();
                        descName.descLink = desc.documentSelfLink;
                        descName.descriptionName = desc.name;
                        descLinksWithNames.put(descName.descLink, descName);
                    } else {
                        if (descLinksWithNames.isEmpty()) {
                            callback.complete(hostSelectionMap, null);
                        } else {
                            findContainerNetworks(state, hostSelectionMap, descLinksWithNames,
                                    callback);
                        }
                    }
                });
    }

    protected void findContainerNetworks(final PlacementHostSelectionTaskState state,
            final Map<String, HostSelection> hostSelectionMap,
            Map<String, DescName> descLinksWithNames,
            final HostSelectionFilterCompletion callback) {

        Map<String, HostSelection> filteredHosts = new TreeMap<>();
        QueryTask q = QueryUtil.buildQuery(ContainerNetworkState.class, false);

        String compositeComponentLinksItemField = QueryTask.QuerySpecification
                .buildCollectionItemName(
                        ContainerNetworkState.FIELD_NAME_COMPOSITE_COMPONENT_LINKS);
        List<String> cclValues = new ArrayList<>(
                Arrays.asList(UriUtils.buildUriPath(CompositeComponentFactoryService.SELF_LINK,
                        state.contextId)));
        QueryUtil.addListValueClause(q, compositeComponentLinksItemField, cclValues);

        QueryUtil.addExpandOption(q);

        QueryUtil.addListValueClause(q,
                ContainerNetworkState.FIELD_NAME_DESCRIPTION_LINK, descLinksWithNames.keySet());

        new ServiceDocumentQuery<ContainerNetworkState>(host, ContainerNetworkState.class)
                .query(q,
                        (r) -> {
                            if (r.hasException()) {
                                host.log(
                                        Level.WARNING,
                                        "Exception while selecting container networks with contextId [%s]. Error: [%s]",
                                        state.contextId, r.getException().getMessage());
                                callback.complete(null, r.getException());
                            } else if (r.hasResult()) {
                                final DescName descName = descLinksWithNames
                                        .get(r.getResult().descriptionLink);
                                descName.addContainerNames(
                                        Collections.singletonList(r.getResult().name));

                                for (HostSelection hs : hostSelectionMap.values()) {
                                    hs.addDesc(descName);
                                }
                            } else {
                                QueryTask networkStateQuery = QueryUtil.buildPropertyQuery(
                                        ContainerNetworkState.class,
                                        ContainerNetworkState.FIELD_NAME_NAME,
                                        descLinksWithNames.values()
                                                .toArray(new DescName[0])[0].descriptionName);

                                QueryUtil.addExpandOption(networkStateQuery);

                                new ServiceDocumentQuery<ContainerNetworkState>(host,
                                        ContainerNetworkState.class)
                                                .query(networkStateQuery,
                                                        (res) -> {
                                                            if (res.hasException()) {
                                                                host.log(
                                                                        Level.WARNING,
                                                                        "Exception while quering for container network [%s]. Error: [%s]",
                                                                        descLinksWithNames.keySet().toArray(new String[0])[0],
                                                                        res.getException()
                                                                                .getMessage());
                                                                callback.complete(null,
                                                                        res.getException());
                                                            } else if (res.hasResult()) {
                                                                if (res.getResult().external) {
                                                                    List<String> parentLinks = res
                                                                            .getResult().parentLinks;
                                                                    for (String parentLink : parentLinks) {
                                                                        if (hostSelectionMap.get(
                                                                                parentLink) != null) {
                                                                            filteredHosts.put(
                                                                                    parentLink,
                                                                                    hostSelectionMap
                                                                                            .get(parentLink));
                                                                        }
                                                                    }
                                                                }
                                                            } else {
                                                                filterByClusterStoreAffinity(
                                                                        hostSelectionMap,
                                                                        filteredHosts, callback,
                                                                        state);
                                                            }
                                                        });
                            }
                        });
    }

    /*
     * This filter considers all the hosts equal, distinguishable only by whether they have a KV
     * store configured or not. At some point we may want to distinguish also special hosts (e.g.
     * Docker Swarm hosts, VIC hosts, etc.) which, as a single host, may be better alternative to
     * clusters of regular hosts sharing the same KV store.
     */
    protected void filterByClusterStoreAffinity(
            final Map<String, HostSelection> hostSelectionMap,
            Map<String, HostSelection> filteredHosts, final HostSelectionFilterCompletion callback,
            PlacementHostSelectionTaskState state) {

        /*
         * No big choice here...
         */
        if ((hostSelectionMap == null) || (hostSelectionMap.size() < 2)) {
            try {
                callback.complete(hostSelectionMap, null);
            } catch (Throwable e) {
                host.log(Level.WARNING, "Exception when completing callback. Error: [%s]",
                        e.getMessage());
                callback.complete(null, e);
            }
            return;
        }

        /*
         * Transform the hostSelectionMap into a map where the keys group sets of hosts that share
         * the same KV store. This includes a special group with the key "NONE" for hosts without a
         * KV store configured.
         */

        Map<String, List<Entry<String, HostSelection>>> hostSelectionByKVStoreMap = new HashMap<>();

        for (Entry<String, HostSelection> entry : hostSelectionMap.entrySet()) {
            HostSelection hostSelection = entry.getValue();

            String clusterStoreKey = hostSelection.clusterStore;
            if (clusterStoreKey == null || clusterStoreKey.isEmpty()) {
                clusterStoreKey = NO_KV_STORE;
            }

            List<Entry<String, HostSelection>> set = hostSelectionByKVStoreMap.get(clusterStoreKey);
            if (set == null) {
                set = new ArrayList<>();
                hostSelectionByKVStoreMap.put(clusterStoreKey, set);
            }

            set.add(entry);
        }

        // Separate the hosts without a KV store configured.
        List<Entry<String, HostSelection>> nones = hostSelectionByKVStoreMap.remove(NO_KV_STORE);

        Map<String, HostSelection> hostSelectedMap = new HashMap<>();

        if (hostSelectionByKVStoreMap.isEmpty()) {
            /*
             * No hosts with KV store configured were found -> Pick one single host from the list of
             * hosts without a KV store configured.
             */

            // TODO - Picking one host randomly, it could pick the best single node available, e.g.
            // more resources, less containers, etc.

            if (filteredHosts.isEmpty() && (nones != null) && !nones.isEmpty()) {
                int chosen = Math
                        .abs(state.customProperties.get(RequestUtils.FIELD_NAME_CONTEXT_ID_KEY)
                                .hashCode() % nones.size());

                Entry<String, HostSelection> entry = nones.get(chosen);
                hostSelectedMap.put(entry.getKey(), entry.getValue());
            } else if (!filteredHosts.isEmpty()) {
                hostSelectedMap = filteredHosts;
            }
        } else {
            /*
             * One or more sets of hosts with the same KV store configured were selected -> Pick one
             * of the clusters.
             */

            // TODO - Picking one cluster randomly, it could pick the best cluster available, e.g.
            // more resources, more hosts, less containers, better containers/host ratio, etc.
            if (!hostSelectedMap.isEmpty()) {
                hostSelectedMap = filteredHosts;
            }

            int chosen = Math.abs(state.customProperties.get(RequestUtils.FIELD_NAME_CONTEXT_ID_KEY)
                    .hashCode() % hostSelectionByKVStoreMap.size());
            List<Entry<String, HostSelection>> entries = hostSelectionByKVStoreMap
                    .get(hostSelectionByKVStoreMap.keySet().toArray(new String[] {})[chosen]);
            for (Entry<String, HostSelection> entry : entries) {
                hostSelectedMap.put(entry.getKey(), entry.getValue());
            }
        }

        // Complete the callback with the selected hosts...

        try {
            callback.complete(hostSelectedMap, null);
        } catch (Throwable e) {
            host.log(Level.WARNING, "Exception when completing callback. Error: [%s]",
                    e.getMessage());
            callback.complete(null, e);
        }
    }

    @Override
    public boolean isActive() {
        return networks != null && networks.size() > 0;
    }

    @Override
    public Map<String, AffinityConstraint> getAffinityConstraints() {
        return isActive() ? networks.entrySet().stream().collect(
                Collectors.toMap(p -> p.getKey(), p -> new AffinityConstraint(p.getKey())))
                : Collections.emptyMap();
    }
}
