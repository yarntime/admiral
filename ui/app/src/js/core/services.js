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

import constants from 'core/constants';
import utils from 'core/utils';
import links from 'core/links';

const IMAGES_SEARCH_QUERY_PROP_NAME = 'q';
const IMAGES_SEARCH_LIMIT_PROP_NAME = 'limit';
const IMAGES_SEARCH_QUERY_WILDCARD = '*';
const TEMPLATES_SEARCH_QUERY_TEMPLATES_ONLY_PARAM = 'templatesOnly';
const TEMPLATES_SEARCH_QUERY_TEMPLATES_PARENTS_ONLY_PARAM = 'templatesParentOnly';
const TEMPLATES_SEARCH_QUERY_IMAGES_ONLY_PARAM = 'imagesOnly';
const TEMPLATE_DESCRIPTION_IMAGES_PARAM = 'descriptionImages';

const REQUEST_PARAM_VALIDATE_OPERATION_NAME = 'validate';

const CONTAINER_TYPE_DOCKER = 'DOCKER_CONTAINER';
const CONTAINER_HOST = 'CONTAINER_HOST';
const COMPOSITE_COMPONENT_TYPE = 'COMPOSITE_COMPONENT';
const NETWORK_TYPE = 'NETWORK';

const DOCUMENT_TYPE_PROP_NAME = 'documentType';
const EXPAND_QUERY_PROP_NAME = 'expand';
const ODATA_COUNT_PROP_NAME = '$count';
const ODATA_FILTER_PROP_NAME = '$filter';
const ODATA_LIMIT_PROP_NAME = '$limit';
const ODATA_ORDERBY_PROP_NAME = '$orderby';

const PRAGMA_HEADER = 'pragma';
const PRAGMA_DIRECTIVE_FORCE_INDEX_UPDATE = 'xn-force-index-update';

const FILTER_VALUE_ALL_FIELDS = 'ALL_FIELDS';

const CONTAINER_HOST_ID_CUSTOM_PROPERTY = '__containerHostId';
const DEFAULT_LIMIT = 20;

const DEBUG_SLOW_MODE_TIMEOUT = utils.getDebugSlowModeTimeout();
if (DEBUG_SLOW_MODE_TIMEOUT) {
  console.warn('DEBUG SLOW MODE ENABLED! Make sure you are running in dev/test mode.');
}

var ajax = function(method, url, data, headers, disableReloadOnUnauthorized) {
  if (!headers) {
    headers = {};
  }

  headers[PRAGMA_HEADER] = PRAGMA_DIRECTIVE_FORCE_INDEX_UPDATE;

  return new Promise(function(resolve, reject) {
    var fn = function() {
      $.ajax({
        method: method,
        url: utils.serviceUrl(url),
        dataType: 'json',
        headers: headers,
        data: data,
        contentType: 'application/json',
        statusCode: {
          403: function() {
            if (!disableReloadOnUnauthorized) {
              window.location.reload(true);
            }
          },
          401: function() {
            if (!disableReloadOnUnauthorized) {
              window.location.reload(true);
            }
          }
        },
        accepts: {
          json: 'application/json'
        }
      }).done(resolve)
        .fail((e) => {
        console.log(e);
        reject(e);
      });
    };

    if (DEBUG_SLOW_MODE_TIMEOUT) {
      var timeout = Math.round(DEBUG_SLOW_MODE_TIMEOUT * Math.random());
      setTimeout(fn, timeout);
    } else {
      fn();
    }
  });
};

var get = function(url, paramsData) {
  return ajax('GET', url, paramsData);
};

var post = function(url, entity) {
  return ajax('POST', url, JSON.stringify(entity));
};

var put = function(url, entity) {
  return ajax('PUT', url, JSON.stringify(entity));
};

var patch = function(url, entity) {
  return ajax('PATCH', url, JSON.stringify(entity));
};

var deleteEntity = function(url) {
  return new Promise(function(resolve, reject) {
    $.ajax({
      method: 'DELETE',
      url: utils.serviceUrl(url),
      data: JSON.stringify({}), // DCP expects empty object in the body to make a delete
      contentType: 'application/json',
      dataType: 'text'
    }).done(resolve)
      .fail(reject);
  });
};

var day2operation = function(url, entity) {
  return post(url, entity);
};

// Simple Odata query builder. By default it will build 'and' query. If provided OCCURRENCE option,
// then it will use it to build 'and', 'or' query. Based on the option provided, it will use
// comparison like 'eq' or 'ne'
var buildOdataQuery = function(queryOptions) {
  var result = '';
  if (queryOptions) {
    var occurrence = queryOptions[constants.SEARCH_OCCURRENCE.PARAM];
    delete queryOptions[constants.SEARCH_OCCURRENCE.PARAM];

    var operator = occurrence === constants.SEARCH_OCCURRENCE.ANY ? 'or' : 'and';

    for (var key in queryOptions) {
      if (queryOptions.hasOwnProperty(key)) {
        var query = queryOptions[key];
        if (query) {
          for (var i = 0; i < query.length; i++) {
            if (result.length > 0) {
              result += ' ' + operator + ' ';
            }
            result += key + ' ' + query[i].op + ' \'' + query[i].val + '\'';
          }
        }
      }
    }
  }
  return result;
};

var makeDay2OperationRequestContainer = function(containerId, op) {
  return makeDay2OperationRequestContainers([containerId], op);
};

var makeDay2OperationRequestNetwork = function(networkId, op) {
  return makeDay2OperationRequestNetworks([networkId], op);
};

var makeDay2OperationRequestCluster = function(clusterContainers, op) {
  var request = {};
  request.resourceType = CONTAINER_TYPE_DOCKER;
  let reslinks = [];
  for (let i = 0; i < clusterContainers.length; i++) {
    reslinks.push(clusterContainers[i].documentSelfLink);
  }
  request.resourceLinks = reslinks;
  request.operation = op;

  return request;
};

var makeDay2OperationRequestComposite = function(compositeId, op) {
  return makeDay2OperationRequestComposites([compositeId], op);
};

var batchDay2OperationResource = function(resourceType, resourceLinks, op) {
  var request = {};
  request.resourceType = resourceType;
  request.resourceLinks = resourceLinks;
  request.operation = op;

  return request;
};

var ensurePrefixResourceLinks = function(prefix, links) {
  let resourceLinks = [];

  links.forEach((link) => {
    if (link.indexOf(prefix) === -1) {
      resourceLinks.push(prefix + '/' + link);
    } else {
      resourceLinks.push(link);
    }
  });

  return resourceLinks;
};

var makeDay2OperationRequestContainers = function(containerLinks, op) {
  return batchDay2OperationResource(CONTAINER_TYPE_DOCKER,
            ensurePrefixResourceLinks(links.CONTAINERS, containerLinks), op);
};

var makeDay2OperationRequestNetworks = function(networkLinks, op) {
  return batchDay2OperationResource(NETWORK_TYPE,
            ensurePrefixResourceLinks(links.NETWORKS, networkLinks), op);
};

var makeDay2OperationRequestComposites = function(compositeComponentLinks, op) {
  return batchDay2OperationResource(COMPOSITE_COMPONENT_TYPE,
            ensurePrefixResourceLinks(links.COMPOSITE_COMPONENTS, compositeComponentLinks), op);
};

var makeDay2OperationRequestScale = function(descriptionLink, contextId,
                                               desiredNumberContainers) {
  // NOTE: desiredNumberContainers is the desired result number of containers in the cluster

  // NOTE: Currently the context id is the composition context id.
  // In case of single container type cluster we don't have context id

  var request = {};
  request.resourceType = CONTAINER_TYPE_DOCKER;
  request.resourceDescriptionLink = descriptionLink;
  request.resourceCount = desiredNumberContainers;
  request.customProperties = {
    __composition_context_id: contextId
  };
  request.operation = 'CLUSTER_RESOURCE';

  return request;
};

var calculateLimit = function() {
  var averageSize = 250;
  var h = $(document).height();
  var w = $(document).width();
  return Math.ceil(w / averageSize * h / averageSize) || DEFAULT_LIMIT;
};

var mergeUrl = function(path, params) {
  params = Object.keys(params).reduce((previous, current) => {
    let value = params[current];
    if (value !== undefined || value !== '') {
      previous[current] = value;
    }
    return previous;
  }, {});
  if (Object.keys(params)) {
    return path + '?' + $.param(params).replace(/\+/g, '%20');
  }
  return path;
};

var buildPaginationUrl = function(path, filter, count, order, limit) {
  var params = {
    [DOCUMENT_TYPE_PROP_NAME]: true,
    [ODATA_COUNT_PROP_NAME]: count,
    [ODATA_LIMIT_PROP_NAME]: limit || calculateLimit(),
    [ODATA_ORDERBY_PROP_NAME]: order
  };
  if (filter) {
    params[ODATA_FILTER_PROP_NAME] = filter;
  }
  return mergeUrl(path, params);
};

var list = function(url, expandQuery, paramsData) {
  paramsData = paramsData || {};
  paramsData[DOCUMENT_TYPE_PROP_NAME] = true;
  if (expandQuery) {
    paramsData[EXPAND_QUERY_PROP_NAME] = true;
  }
  return get(mergeUrl(url, paramsData)).then(function(result) {
    // The result.documents check is added to support vRA.
    if (expandQuery && result.documents) {
      return result.documents;
    } else {
      return result;
    }
  });
};

var services = {};

services.loadDocument = function(documentSelfLink) {
  return get(documentSelfLink);
};

services.deleteDocument = function(documentSelfLink) {
  return deleteEntity(documentSelfLink);
};

services.patchDocument = function(documentSelfLink, diff) {
  return ajax('PATCH', documentSelfLink, JSON.stringify(diff));
};

services.updateDocument = function(documentSelfLink, document) {
  return ajax('PUT', documentSelfLink, JSON.stringify(document));
};

services.loadCredentials = function() {
  var oDataFilter = {};
  oDataFilter[ODATA_FILTER_PROP_NAME] = 'customProperties/scope ne \'SYSTEM\'';
  /*
  Explicitly not setting oData filter as it break CAFE -> DCP integration.
  The problem is that nested properties should be filtered by "/"
  (see filter section http://www.odata.org/documentation/odata-version-2-0/uri-conventions/)

  customPropertis.scope ne 'SYSTEM' throws in CAFE: System request parameter
  $filter=customProperties.scope ne 'SYSTEM' is not properly formatted. Details:
  Unable to read expression with tokens: [[customProperties], [.], [scope]]

  customPropertis/scope ne 'SYSTEM' throws in DCP: DCP error with Http code: [400]...
  it hould be fixed on DCP level, the problem lies in
  com.vmware.xenon.common.ODataTokenizer.tokenize()
  */
  return list(links.CREDENTIALS, true);

};

services.loadCredential = function(id) {
  var prefixPath = links.CREDENTIALS + '/';

  var callParamId = id;
  if (!id.startsWith(prefixPath)) {
    callParamId = prefixPath + id;
  }

  return get(callParamId);
};

services.createCredential = function(credential) {
  return post(links.CREDENTIALS, credential);
};

services.updateCredential = function(credential) {
  return put(credential.documentSelfLink, credential);
};

services.deleteCredential = function(credential) {
  return deleteEntity(credential.documentSelfLink);
};

services.loadDeploymentPolicies = function(documentSelfLinks) {
  var params = {};
  if (documentSelfLinks && documentSelfLinks.length) {
    params[ODATA_FILTER_PROP_NAME] = buildOdataQuery({
      documentSelfLink: documentSelfLinks.map((link) => {
        return {
          val: link,
          op: 'eq'
        };
      }),
      [constants.SEARCH_OCCURRENCE.PARAM]: constants.SEARCH_OCCURRENCE.ANY
    });
  }
  return list(links.DEPLOYMENT_POLICIES, true, params);
};

services.loadDeploymentPolicy = function(policyLink) {
  return get(policyLink);
};

services.createDeploymentPolicy = function(policy) {
  return post(links.DEPLOYMENT_POLICIES, policy);
};

services.updateDeploymentPolicy = function(policy) {
  return patch(policy.documentSelfLink, policy);
};

services.deleteDeploymentPolicy = function(policy) {
  return deleteEntity(policy.documentSelfLink);
};

services.createTag = function(tag) {
  return post(links.TAGS, tag);
};

services.loadTag = function(key, value) {
  return list(links.TAGS, true, {
    [ODATA_FILTER_PROP_NAME]: buildOdataQuery({
      key: [{
        val: key,
        op: 'eq'
      }],
      value: [{
        val: value,
        op: 'eq'
      }]
    })
  }).then((result) => {
    return Object.values(result)[0];
  });
};

services.loadTags = function(documentSelfLinks) {
  var params = {};
  if (documentSelfLinks && documentSelfLinks.length) {
    params[ODATA_FILTER_PROP_NAME] = buildOdataQuery({
      documentSelfLink: documentSelfLinks.map((link) => {
        return {
          val: link,
          op: 'eq'
        };
      }),
      [constants.SEARCH_OCCURRENCE.PARAM]: constants.SEARCH_OCCURRENCE.ANY
    });
  }
  return list(links.TAGS, true, params);
};

services.searchTags = function(q) {
  var params = {};
  if (q) {
    var pair = q.split(':');
    var occurrence = pair[1] ? constants.SEARCH_OCCURRENCE.ALL : constants.SEARCH_OCCURRENCE.ANY;
    params[ODATA_FILTER_PROP_NAME] = buildOdataQuery({
      key: [{
        val: pair[0] + '*',
        op: 'eq'
      }],
      value: [{
        val: (pair[1] || pair[0] || '') + '*',
        op: 'eq'
      }],
      [constants.SEARCH_OCCURRENCE.PARAM]: occurrence
    });
  }
  return list(links.TAGS, true, params);
};

services.loadResourcePools = function(documentSelfLinks) {
  var params = {};
  if (documentSelfLinks && documentSelfLinks.length) {
    params[ODATA_FILTER_PROP_NAME] = buildOdataQuery({
      documentSelfLink: documentSelfLinks.map((link) => {
        return {
          val: link,
          op: 'eq'
        };
      }),
      [constants.SEARCH_OCCURRENCE.PARAM]: constants.SEARCH_OCCURRENCE.ANY
    });
  }
  return list(links.EPZ_CONFIG, true, params);
};

services.loadResourcePool = function(documentSelfLink) {
  return get(links.EPZ_CONFIG + documentSelfLink);
};

services.createResourcePool = function(config) {
  return post(links.EPZ_CONFIG, config);
};

services.updateResourcePool = function(config) {
  return patch(links.EPZ_CONFIG + config.documentSelfLink, config);
};

services.deleteResourcePool = function(config) {
  return deleteEntity(links.EPZ_CONFIG + config.documentSelfLink);
};

services.countHostsPerResourcePool = function(resourcePoolLink, onlyContainerHosts) {
  var queryOptions = {
    placementZone: resourcePoolLink
  };

  let params = {
    [DOCUMENT_TYPE_PROP_NAME]: true,
    [ODATA_COUNT_PROP_NAME]: true,
    [ODATA_FILTER_PROP_NAME]: buildHostsQuery(queryOptions, onlyContainerHosts)
  };

  return get(mergeUrl(links.COMPUTE_RESOURCES, params)).then((result) => {
      return result.totalCount;
  });
};

services.loadCertificates = function() {
  return list(links.SSL_TRUST_CERTS, true);
};

services.loadCertificate = function(selfLink) {
  return get(selfLink);
};

services.importCertificate = function(hostUri, acceptCertificate) {
  var trustImportRequest = {
    hostUri: hostUri,
    acceptCertificate: acceptCertificate
  };

  return new Promise(function(resolve, reject) {
    $.ajax({
      method: 'PUT',
      url: utils.serviceUrl(links.SSL_TRUST_CERTS_IMPORT),
      data: JSON.stringify(trustImportRequest),
      contentType: 'application/json',
      dataType: 'json',
      accepts: {
        json: 'application/json'
      }
    }).done(function(result, textStatus, request) {
      if (result) {
        // If the certificate is not imported and needs acceptance
        resolve(result, null);
      } else {
        // If the service was already imported, then we have a location header provider.
        // Otherwise it is signed by a known CA and does not need import.
        var certificateLocation = request.getResponseHeader('Location');
        resolve(null, certificateLocation);
      }
    }).fail(reject);
  });
};

services.createCertificate = function(certificate) {
  return post(links.SSL_TRUST_CERTS, certificate);
};

services.updateCertificate = function(certificate) {
  return patch(certificate.documentSelfLink, certificate);
};

services.deleteCertificate = function(certificate) {
  return deleteEntity(certificate.documentSelfLink);
};

services.loadHostDescriptions = function(documentSelfLinks) {
  var params = {};
  if (documentSelfLinks && documentSelfLinks.length) {
    params[ODATA_FILTER_PROP_NAME] = buildOdataQuery({
      documentSelfLink: documentSelfLinks.map((link) => {
        return {
          val: link,
          op: 'eq'
        };
      }),
      [constants.SEARCH_OCCURRENCE.PARAM]: constants.SEARCH_OCCURRENCE.ANY
    });
  }
  return list(links.COMPUTE_DESCRIPTIONS, true, params);
};

services.createHostDescription = function(hostData) {
  var hostDescription = {
    name: hostData.instanceType,
    zoneId: hostData.zoneId,
    customProperties: {
      __resourcePoolLink: hostData.resourcePool.documentSelfLink,
      __authCredentialsLink: hostData.credential.documentSelfLink,
      awsSecurityGroup: 'admiral-security-group',
      __deploymentPolicyLink: hostData.deploymentPolicy
    },
    supportedChildren: ['DOCKER_CONTAINER']
  };

  let envName = hostData.providerType === 'AWS' ? 'Amazon Web Services' : null;
  // Only Amazon supported currently
  if (envName != null) {
    hostDescription.environmentName = envName;
  }

  return post(links.COMPUTE_DESCRIPTIONS, hostDescription);
};

services.addHost = function(host) {
  return put(links.CONTAINER_HOSTS, host);
};

services.createHost = function(hostDescription, clusterSize) {
  var request = {};
  request.resourceType = 'CONTAINER_HOST';
  request.operation = 'PROVISION_CONTAINER_HOSTS';
  request.resourceDescriptionLink = hostDescription.documentSelfLink;
  request.resourceCount = clusterSize;

  return post(links.REQUESTS, request);
};

services.validateHost = function(host) {
  return put(links.CONTAINER_HOSTS + '?' + REQUEST_PARAM_VALIDATE_OPERATION_NAME + '=true',
              host);
};

services.loadHostDescriptionByLink = function(hostDescriptionLink) {
  return get(hostDescriptionLink);
};

services.loadHost = function(hostId) {
  let selfLink = links.COMPUTE_RESOURCES + '/' + hostId;
  return this.loadHostsByLinks([selfLink]).then((result) => {
    return result[selfLink];
  });
};

services.loadHostByLink = function(hostLink) {
  return get(hostLink);
};

services.updateHost = function(hostId, hostData) {
  return put(links.COMPUTE_RESOURCES + '/' + hostId, hostData);
};

services.enableHost = function(hostId) {
  return patch(links.COMPUTE_RESOURCES + '/' + hostId, {
    'powerState': 'ON'
  });
};

services.disableHost = function(hostId) {
  return patch(links.COMPUTE_RESOURCES + '/' + hostId, {
    'powerState': 'SUSPEND'
  });
};

services.removeHost = function(hostId) {
  // this is second day op not CRUD
  var request = {};
  request.resourceType = CONTAINER_HOST;
  request.resourceLinks = [links.COMPUTE_RESOURCES + '/' + hostId];
  request.operation = 'REMOVE_RESOURCE';

  return day2operation(links.REQUESTS, request).then(function(removalRequest) {
    return removalRequest;
  });
};

services.loadHosts = function(queryOptions, onlyContainerHosts) {
  let filter = buildHostsQuery(queryOptions, onlyContainerHosts);
  let url = buildPaginationUrl(links.COMPUTE_RESOURCES, filter, true, 'creationTimeMicros asc');
  return get(url).then(function(result) {
    return result;
  });
};

services.loadHostsByLinks = function(documentSelfLinks) {
  var params = {};
  if (documentSelfLinks && documentSelfLinks.length) {
    params[ODATA_FILTER_PROP_NAME] = buildOdataQuery({
      documentSelfLink: documentSelfLinks.map((link) => {
        return {
          val: link,
          op: 'eq'
        };
      }),
      [constants.SEARCH_OCCURRENCE.PARAM]: constants.SEARCH_OCCURRENCE.ANY
    });
  }
  return list(links.COMPUTE_RESOURCES, true, params);
};

services.searchHosts = function(query, limit) {
  var qOps = { any: query };

  let filter = buildHostsQuery(qOps, true);
  let url = buildPaginationUrl(links.COMPUTE_RESOURCES, filter, true,
                               'creationTimeMicros asc', limit);
  return get(url).then(function(data) {
    var documentLinks = data.documentLinks || [];

    var result = {
      totalCount: data.totalCount
    };

    result.items = documentLinks.map((link) => {
      return data.documents[link];
    });

    return result;
  });
};

services.loadMachines = function(queryOptions) {
  let filter = buildHostsQuery(queryOptions, false, false);
  let url = buildPaginationUrl(links.COMPUTE_RESOURCES, filter, true, 'creationTimeMicros asc');
  return get(url).then(function(result) {
    return result;
  });
};

services.loadCompute = function(queryOptions) {
  let filter = buildHostsQuery(queryOptions, false, true);
  let url = buildPaginationUrl(links.COMPUTE_RESOURCES, filter, true, 'creationTimeMicros asc');
  return get(url).then(function(result) {
    return result;
  });
};

services.loadNextPage = function(nextPageLink) {
  return get(nextPageLink + '&' + DOCUMENT_TYPE_PROP_NAME + '=true').then(function(result) {
    return result;
  });
};

services.loadImages = function(queryOptions) {
  if (!queryOptions) {
    queryOptions = {};
  }

  var anys = toArrayIfDefined(queryOptions.any);

  var params = {};
  if (anys) {
    params[IMAGES_SEARCH_QUERY_PROP_NAME] = anys[0];
  } else {
    params[IMAGES_SEARCH_QUERY_PROP_NAME] = IMAGES_SEARCH_QUERY_WILDCARD;
  }

  return list(links.IMAGES, false, params).then(function(data) {
    var results = data.results || [];
    results.sort(utils.templateSortFn);
    return results;
  });
};

services.loadImageIds = function(query, limit) {
  var params = {};
  params[IMAGES_SEARCH_QUERY_PROP_NAME] = query;
  params[IMAGES_SEARCH_LIMIT_PROP_NAME] = limit;
  params[TEMPLATES_SEARCH_QUERY_IMAGES_ONLY_PARAM] = true;

  return list(links.IMAGES, false, params).then(function(data) {
    var results = data.results || [];
    results.sort(utils.templateSortFn);
    var imageIds = [];
    for (var k in results) {
      if (results.hasOwnProperty(k)) {
        var image = results[k];
        imageIds.push(image.name);
      }
    }
    return imageIds;
  });
};

services.loadTemplates = function(queryOptions) {
  if (!queryOptions) {
    queryOptions = {};
  }

  var anys = toArrayIfDefined(queryOptions.any);

  var params = {};
  if (anys) {
    // TODO: there can be multiple query requests but we take only the first one, as the backend
    // does not handle multiple
    params[IMAGES_SEARCH_QUERY_PROP_NAME] = anys[0];
  } else {
    params[IMAGES_SEARCH_QUERY_PROP_NAME] = IMAGES_SEARCH_QUERY_WILDCARD;
  }

  if (queryOptions[constants.SEARCH_CATEGORY_PARAM] ===
      constants.TEMPLATES.SEARCH_CATEGORY.TEMPLATES) {
    params[TEMPLATES_SEARCH_QUERY_TEMPLATES_ONLY_PARAM] = true;
    params[TEMPLATES_SEARCH_QUERY_TEMPLATES_PARENTS_ONLY_PARAM] = true;
  } else if (queryOptions[constants.SEARCH_CATEGORY_PARAM] ===
             constants.TEMPLATES.SEARCH_CATEGORY.IMAGES) {
    params[TEMPLATES_SEARCH_QUERY_IMAGES_ONLY_PARAM] = true;
  }

  return list(links.TEMPLATES, false, params).then(function(data) {
    var results = data.results || [];
    var isPartialResult = data.isPartialResult || false;
    results.sort(utils.templateSortFn);
    return {
      results: results,
      isPartialResult: isPartialResult
    };
  });
};

services.loadTemplateDescriptionImages = function(compositeDescriptionSelfLink) {
  var params = {};
  params[TEMPLATE_DESCRIPTION_IMAGES_PARAM] = true;
  return get(compositeDescriptionSelfLink, params);
};

services.loadRegistries = function() {
  return list(links.REGISTRIES, true);
};

services.loadRegistry = function(documentSelfLink) {
  return get(documentSelfLink);
};

services.createOrUpdateRegistry = function(registry) {
  return new Promise(function(resolve, reject) {
    $.ajax({
      method: 'PUT',
      url: utils.serviceUrl(links.REGISTRY_HOSTS),
      dataType: 'json',
      data: JSON.stringify(registry),
      contentType: 'application/json',
      accepts: {
        json: 'application/json'
      }
    }).done(function(data, status, xhr) {
      resolve([data, status, xhr]);
    }).fail(reject);
  });
};

services.validateRegistry = function(registry) {
  return put(links.REGISTRY_HOSTS + '?' + REQUEST_PARAM_VALIDATE_OPERATION_NAME + '=true',
      registry);
};

services.updateRegistry = function(registry) {
  return patch(registry.documentSelfLink, registry);
};

services.deleteRegistry = function(registry) {
  return deleteEntity(registry.documentSelfLink);
};

services.loadRequests = function() {
  return list(links.REQUESTS, true);
};

services.loadRequestByStatusLink = function(requestStatusLink) {
  let params = {
    [ODATA_FILTER_PROP_NAME]: buildOdataQuery({
      requestTrackerLink: [{
        val: requestStatusLink,
        op: 'eq'
      }],
      [constants.SEARCH_OCCURRENCE.PARAM]: constants.SEARCH_OCCURRENCE.ANY
    })
  };

  return get(mergeUrl(links.REQUESTS, params));
};

services.loadRequestStatuses = function(itemsType) {
  var params = {};

  if (itemsType === 'running') {
    params[constants.SEARCH_OCCURRENCE.PARAM] = constants.SEARCH_OCCURRENCE.ANY;
    params['taskInfo/stage'] = [{
      val: constants.REQUESTS.STAGES.CREATED,
      op: 'eq'
    }, {
      val: constants.REQUESTS.STAGES.STARTED,
      op: 'eq'
    }];
  }

  if (itemsType === 'failed') {
    params[constants.SEARCH_OCCURRENCE.PARAM] = constants.SEARCH_OCCURRENCE.ANY;
    params['taskInfo/stage'] = [{
      val: constants.REQUESTS.STAGES.FAILED,
      op: 'eq'
    }, {
      val: constants.REQUESTS.STAGES.CANCELLED,
      op: 'eq'
    }];
  }

  var filter = buildOdataQuery(params);
  var url = buildPaginationUrl(links.REQUEST_STATUS, filter, false,
      'documentExpirationTimeMicros desc');
  return get(url).then(function(result) {
    return result;
  });
};

services.loadRequestStatus = function(requestTrackerLink) {
  return get(requestTrackerLink);
};

services.removeRequestStatus = function(requestStatusSelfLink) {
  var requestBrokerLink = links.REQUESTS + '/' + utils.getDocumentId(requestStatusSelfLink);
  return deleteEntity(requestBrokerLink);
};

services.loadNotifications = function() {
  return get(links.NOTIFICATIONS);
};

services.loadPlacements = function() {
  return list(links.RESOURCE_GROUP_PLACEMENTS, true);
};

services.loadPlacement = function(documentSelfLink) {
  return get(documentSelfLink);
};

services.createPlacement = function(placement) {
  return post(links.RESOURCE_GROUP_PLACEMENTS, placement);
};

services.updatePlacement = function(placement) {
  return put(placement.documentSelfLink, placement);
};

services.deletePlacement = function(placement) {
  return deleteEntity(placement.documentSelfLink);
};

services.loadEnvironments = function() {
  return list(links.ENVIRONMENT_MAPPING, true);
};

services.loadEnvironment = function(documentSelfLink) {
  return get(documentSelfLink);
};

services.createEnvironment = function(environment) {
  return post(links.ENVIRONMENT_MAPPING, environment);
};

services.updateEnvironment = function(environment) {
  return put(environment.documentSelfLink, environment);
};

services.deleteEnvironment = function(environment) {
  return deleteEntity(environment.documentSelfLink);
};

services.loadEndpoints = function() {
  return list(links.ENDPOINTS, true);
};

services.loadEndpoint = function(documentSelfLink) {
  return get(links.ENDPOINTS + documentSelfLink);
};

services.verifyEndpoint = function(endpoint) {
  return put(links.ENDPOINTS + '?validate', endpoint);
};

services.createEndpoint = function(endpoint) {
  return post(links.ENDPOINTS + '?enumerate', endpoint);
};

services.updateEndpoint = function(endpoint) {
  return put(links.ENDPOINTS + endpoint.documentSelfLink, endpoint);
};

services.deleteEndpoint = function(endpoint) {
  return deleteEntity(links.ENDPOINTS + endpoint.documentSelfLink);
};

services.loadContainer = function(containerId) {
  return get(links.CONTAINERS + '/' + containerId);
};

services.loadContainers = function(queryOptions) {
  var filter = buildContainersSearchQuery(queryOptions);
  var url = buildPaginationUrl(links.CONTAINERS, filter, true, 'created asc');
  return get(url).then(function(result) {
    return result;
  });
};

services.loadContainersForCompositeComponent = function(compositeComponentId) {
  let urlPrefix = links.COMPOSITE_COMPONENTS + '/';
  var compositeComponentLink = (compositeComponentId.indexOf(urlPrefix) > -1)
                                  ? compositeComponentId : urlPrefix + compositeComponentId;

  return services.loadContainers({compositeComponentLink: compositeComponentLink});
};

services.loadCompositeComponent = function(compositeComponentId) {
  return get(links.COMPOSITE_COMPONENTS + '/' + compositeComponentId);
};

services.loadCompositeComponents = function(queryOptions) {
  var filter = queryOptions ? buildContainersSearchQuery(queryOptions) : '';
  let url = buildPaginationUrl(links.COMPOSITE_COMPONENTS, filter, true,
      'documentUpdateTimeMicros asc');
  return get(url).then(function(result) {
    return result;
  });
};

services.loadNetworks = function(queryOptions) {
  var filter = buildContainersSearchQuery(queryOptions);
  var url = buildPaginationUrl(links.NETWORKS, filter, true);
  return get(url).then(function(result) {
    return result;
  });
};

services.loadExposedService = function(link) {
  return get(link);
};

services.loadExposedServices = function() {
  return list(links.EXPOSED_SERVICES, true);
};

services.loadContainerLogs = function(containerId, sinceMs) {
  return new Promise(function(resolve, reject) {
    var logRequestUriPath = links.CONTAINER_LOGS + '?id=' + containerId;
    if (sinceMs) {
      var sinceSeconds = sinceMs / 1000;
      logRequestUriPath += '&since=' + sinceSeconds;
    }

    get(logRequestUriPath).then(function(logServiceState) {
      if (logServiceState && logServiceState.logs) {
        var decodedLogs = atob(logServiceState.logs);
        resolve(decodedLogs);
      } else {
        resolve('');
      }
    }).catch(reject);
  });
};

services.createContainer = function(containerDescription, group) {
  return services.createContainerDescription(containerDescription).then(
    function(createdContainerDescription) {
      return services.createRequest(createdContainerDescription.documentSelfLink,
                            createdContainerDescription.tenantLinks, group, CONTAINER_TYPE_DOCKER);
    });
};

services.createNetwork = function(networkDescription, hostIds) {
  var customProperties = {};
  customProperties[CONTAINER_HOST_ID_CUSTOM_PROPERTY] = hostIds.join(',');
  return services.createNetworkDescription(networkDescription).then(
    function(createdNetworkDescription) {
      return services.createRequest(createdNetworkDescription.documentSelfLink,
                            createdNetworkDescription.tenantLinks, null, NETWORK_TYPE,
                            customProperties);
    });
};

services.startContainer = function(containerId) {

  return day2operation(links.REQUESTS,
    makeDay2OperationRequestContainer(containerId, 'Container.Start'))
    .then(function(startRequest) {
      return startRequest;
    });
};

services.stopContainer = function(containerId) {

  return day2operation(links.REQUESTS,
    makeDay2OperationRequestContainer(containerId, 'Container.Stop'))
    .then(function(stopRequest) {
      return stopRequest;
    });
};

services.removeContainer = function(containerId) {

  return day2operation(links.REQUESTS,
    makeDay2OperationRequestContainer(containerId, 'Container.Delete'))
    .then(function(deleteRequest) {
      return deleteRequest;
    });
};

services.removeNetwork = function(networkId) {

  return day2operation(links.REQUESTS,
    makeDay2OperationRequestNetwork(networkId, 'Network.Delete'))
    .then(function(deleteRequest) {
      return deleteRequest;
    });
};

services.batchOpContainers = function(containerIds, operation) {
  return day2operation(links.REQUESTS,
    makeDay2OperationRequestContainers(containerIds, operation))
    .then(function(day2OpRequest) {
      return day2OpRequest;
    });
};

services.batchOpNetworks = function(networkIds, operation) {
  return day2operation(links.REQUESTS,
    makeDay2OperationRequestNetworks(networkIds, operation))
    .then(function(day2OpRequest) {
      return day2OpRequest;
    });
};

services.startCompositeContainer = function(compositeId) {
  return day2operation(links.REQUESTS,
    makeDay2OperationRequestComposite(compositeId, 'Container.Start'))
    .then(function(startRequest) {
      return startRequest;
    });
};

services.stopCompositeContainer = function(compositeId) {
  return day2operation(links.REQUESTS,
    makeDay2OperationRequestComposite(compositeId, 'Container.Stop'))
    .then(function(stopRequest) {
      return stopRequest;
    });
};

services.removeCompositeContainer = function(compositeId) {

  return day2operation(links.REQUESTS,
    makeDay2OperationRequestComposite(compositeId, 'Container.Delete'))
    .then(function(deleteRequest) {
      return deleteRequest;
    });
};

services.batchOpCompositeContainers = function(compositeIds, operation) {
  return day2operation(links.REQUESTS,
    makeDay2OperationRequestComposites(compositeIds, operation))
    .then(function(day2OpRequest) {
      return day2OpRequest;
    });
};

services.modifyClusterSize = function(descriptionLink, contextId, numberOfContainers) {

  return day2operation(links.REQUESTS,
    makeDay2OperationRequestScale(descriptionLink, contextId, numberOfContainers))
    .then(function(clusteringRequest) {
      return clusteringRequest;
    });
};

services.startCluster = function(clusterContainers) {

  return day2operation(links.REQUESTS,
    makeDay2OperationRequestCluster(clusterContainers, 'Container.Start'));
};

services.stopCluster = function(clusterContainers) {

  return day2operation(links.REQUESTS,
    makeDay2OperationRequestCluster(clusterContainers, 'Container.Stop'));
};

services.removeCluster = function(clusterContainers) {

  return day2operation(links.REQUESTS,
    makeDay2OperationRequestCluster(clusterContainers, 'Container.Delete'));
};

services.createContainerTemplate = function(containerDescription) {

  return services.createContainerDescription(containerDescription)
    .then(function(createdContainerDescription) {
      var multiContainerDescription = {
        name: createdContainerDescription.name,
        descriptionLinks: [createdContainerDescription.documentSelfLink]
      };

      return post(links.COMPOSITE_DESCRIPTIONS, multiContainerDescription);
  });
};

services.removeContainerTemplate = function(templateId) {
  return deleteEntity(links.COMPOSITE_DESCRIPTIONS + '/' + templateId);
};

services.createMultiContainerFromTemplate = function(templateId, group) {
  return services.loadContainerTemplate(templateId).then((template) => {
    return services.createRequest(template.documentSelfLink, template.tenantLinks, group,
                                  COMPOSITE_COMPONENT_TYPE);
  });
};

services.createRequest = function(resourceDescriptionLink, tenantLinks, group, resourceType,
  customProperties) {

  var request = {};
  request.resourceType = resourceType;
  request.resourceDescriptionLink = resourceDescriptionLink;
  request.customProperties = customProperties;

  if (group) {
    if (tenantLinks) {
      let groupFound = tenantLinks.find((link) => {
        return link === group;
      });
      if (!groupFound) {
        tenantLinks.push(group);
        request.tenantLinks = tenantLinks;
      }
    } else {
      request.tenantLinks = [group];
    }
  }

  return post(links.REQUESTS, request).then(function(createdRequest) {
    return createdRequest;
  });
};

services.loadContainerTemplates = function() {
  return list(links.COMPOSITE_DESCRIPTIONS, true);
};

services.loadContainerTemplate = function(documentId) {
  return get(links.COMPOSITE_DESCRIPTIONS + '/' + documentId);
};

services.updateContainerTemplate = function(template) {
  return patch(template.documentSelfLink, template);
};

services.copyContainerTemplate = function(template) {
  return post(links.COMPOSITE_DESCRIPTIONS_CLONE, template);
};

services.importContainerTemplate = function(template) {
  return new Promise(function(resolve, reject) {
    $.ajax({
      method: 'POST',
      url: utils.serviceUrl(links.COMPOSITE_DESCRIPTIONS_CONTENT),
      data: template,
      contentType: 'application/yaml',
      dataType: 'text',
      accepts: {
        yaml: 'application/yaml'
      }
    }).done(function(data, status, request) {
      var templateSelfLink = request.getResponseHeader('location');
      resolve(templateSelfLink);
    }).fail(reject);
  });
};

services.createContainerDescription = function(containerDescription) {
  return post(links.CONTAINER_DESCRIPTIONS, containerDescription);
};

services.updateContainerDescription = function(containerDescription) {
  return put(containerDescription.documentSelfLink, containerDescription);
};

services.createNetworkDescription = function(networkDescription) {
  return post(links.CONTAINER_NETWORK_DESCRIPTIONS, networkDescription);
};

services.searchNetworks = function(query, limit) {
  var filter = buildOdataQuery({
    name: [{
      val: '*' + query + '*',
      op: 'eq'
    }]
  });

  // ideally we would order by name, but there is an issue with Xenon and various
  // services having name field, some of which are not marked as Sortable.
  let url = buildPaginationUrl(links.NETWORKS, filter, true,
                               'documentUpdateTimeMicros desc', limit);
  return get(url).then(function(data) {
    var documentLinks = data.documentLinks || [];

    var result = {
      totalCount: data.totalCount
    };

    result.items = documentLinks.map((link) => {
      return data.documents[link];
    });

    return result;
  });
};

services.loadClusterContainers = function(descriptionLink, compositionContextId) {
  descriptionLink = (descriptionLink.indexOf(links.CONTAINER_DESCRIPTIONS) === -1)
                        ? links.CONTAINER_DESCRIPTIONS + '/' + descriptionLink
                        : descriptionLink;
  var params = {};
  let query = buildClusterQuery(descriptionLink, compositionContextId);
  if (query) {
    params[ODATA_FILTER_PROP_NAME] = query;
  }
  return list(links.CONTAINERS, true, params);
};

services.loadContainerStats = function(containerId) {
  return new Promise(function(resolve, reject) {
    var containerStatsPath = links.CONTAINERS + '/' + containerId + '/stats';
    get(containerStatsPath).then(function(serviceStats) {
       var val = serviceStats.entries;
       if (val) {
          var containerStats = {
              cpuUsage: val.cpuUsage ? val.cpuUsage.latestValue : 0,
              memLimit: val.memLimit ? val.memLimit.latestValue : 0,
              memUsage: val.memUsage ? val.memUsage.latestValue : 0,
              networkIn: val.networkIn ? val.networkIn.latestValue : 0,
              networkOut: val.networkOut ? val.networkOut.latestValue : 0
          };
          resolve(containerStats);
       } else {
          resolve(null);
       }
    }).catch(reject);
  });
};

services.loadEventLogs = function(itemsType) {
  var params = {};

  if (itemsType === 'warning') {
    params.eventLogType = [{
      val: constants.EVENTLOG.TYPE.WARNING,
      op: 'eq'
    }];
  }

  if (itemsType === 'error') {
    params.eventLogType = [{
      val: constants.EVENTLOG.TYPE.ERROR,
      op: 'eq'
    }];
  }

  var filter = buildOdataQuery(params);
  var url = buildPaginationUrl(links.EVENT_LOGS, filter, false,
                                'documentExpirationTimeMicros desc');
  return get(url).then(function(result) {
    return result;
  });
};

services.clearEventLog = function() {
  return day2operation(links.DELETE_TASKS, {
    deleteDocumentKind: 'com:vmware:admiral:log:EventLogService:EventLogState'
  });
};

services.clearRequests = function() {
  return day2operation(links.DELETE_TASKS, {
    deleteDocumentKind: 'com:vmware:admiral:request:RequestStatusService:RequestStatus'
  });
};

services.getEventLogNotifications = function() {
  return get(links.NOTIFICATIONS);
};

services.removeEventLog = function(eventLogSelfLink) {
  return deleteEntity(eventLogSelfLink);
};

services.loadGroups = function() {
  return list(links.GROUPS);
};

services.loadResourceGroups = function() {
  return list(links.RESOURCE_GROUPS, true, {});
};

services.loadResourceGroup = function(groupLink) {
  return get(groupLink);
};

services.createResourceGroup = function(group) {
  return post(links.RESOURCE_GROUPS, group);
};

services.updateResourceGroup = function(group) {
  return patch(group.documentSelfLink, group);
};

services.deleteResourceGroup = function(group) {
  return deleteEntity(group.documentSelfLink);
};

services.loadCurrentUser = function() {
  return ajax('GET', links.USER_SESSION, {}, {}, true);
};

services.loadConfigurationProperties = function() {
  return list(links.CONFIG_PROPS, true);
};

services.getContainerShellUri = function(containerId) {
  return new Promise(function(resolve, reject) {
    $.ajax({
      method: 'GET',
      url: utils.serviceUrl(links.CONTAINER_SHELL),
      dataType: 'text',
      data: {id: containerId},
      contentType: 'text/plain',
      statusCode: {
        403: function() {
          window.location.reload(true);
        }
      }
    }).done(resolve)
      .fail(reject);
  });
};

services.login = function(username, password) {
  var data = JSON.stringify({
    requestType: 'LOGIN'
  });

  var headers = {
    Authorization: 'Basic ' + btoa(username + ':' + password)
  };

  return ajax('POST', links.BASIC_AUTH, data, headers, true);
};

services.logout = function() {
  var data = {
    requestType: 'LOGOUT'
  };

  return post(links.BASIC_AUTH, data);
};

services.triggerDataCollection = function() {
  return ajax('POST', links.DATA_COLLECTION, null, null, true);
};

services.loadPopularImages = function() {
  return list(links.POPULAR_IMAGES);
};

var toArrayIfDefined = function(obj) {
  if ($.isArray(obj)) {
    return obj;
  } else if (obj) {
    return [obj];
  }

  return null;
};

var buildHostsQuery = function(queryOptions, onlyContainerHosts, onlyCompute) {
  let qOps = [];

  // Filter out Amazon parent hosts
  qOps.descriptionLink = [
    {
      op: 'ne',
      val: links.COMPUTE_DESCRIPTIONS + '/*-parent-compute-desc'
    }
  ];

  //  Filter only actual compute hosts
  if (onlyContainerHosts === false) {
    qOps['customProperties/__endpointType'] = [
      {
        op: 'ne',
        val: '*'
      }
    ];
    qOps['customProperties/__computeContainerHost'] = [
      {
        op: 'ne',
        val: '*'
      }
    ];
  }

  //Filter only actual compute hosts that are container hosts
  if (onlyContainerHosts === true) {
    qOps['customProperties/__computeContainerHost'] = [
      {
        op: 'eq',
        val: '*'
      }
    ];
  }

  if (onlyCompute === false) {
    qOps['customProperties/__computeType'] = [
      {
        op: 'eq',
        val: 'VirtualMachine'
      }
    ];
  }

  if (onlyCompute === true) {
    qOps['customProperties/__computeType'] = [
      {
        op: 'ne',
        val: 'VirtualMachine'
      }
    ];
  }

  if (queryOptions) {
    var anyArray = toArrayIfDefined(queryOptions.any);
    if (anyArray) {
      qOps[FILTER_VALUE_ALL_FIELDS] = anyArray.map((any) => {
        return {
          val: '*' + any + '*',
          op: 'eq'
        };
      });
    }

    var addressArray = toArrayIfDefined(queryOptions.address);
    if (addressArray) {
      qOps.address = addressArray.map((address) => {
        return {
          val: '*' + address + '*',
          op: 'eq'
        };
      });
    }

    var nameArray = toArrayIfDefined(queryOptions.name);
    if (nameArray) {
      qOps.name = nameArray.map((name) => {
        return {
          val: '*' + name + '*',
          op: 'eq'
        };
      });
    }

    var typeArray = toArrayIfDefined(queryOptions.type);
    if (typeArray) {
      qOps['customProperties/__computeType'] = typeArray.map((type) => {
        return {
          val: '*' + type + '*',
          op: 'eq'
        };
      });
    }

    var resourcePoolArray = toArrayIfDefined(queryOptions.placementZone);
    if (resourcePoolArray) {
      for (let i = 0; i < resourcePoolArray.length; i++) {
        let prefixPath = links.RESOURCE_POOLS + '/';
        let resourcePoolId = resourcePoolArray[i];
        if (resourcePoolId.startsWith(prefixPath)) {
            resourcePoolId = resourcePoolId.slice(prefixPath.length);
        }
        qOps['customProperties/' + constants.CUSTOM_PROPS.EPZ_NAME_PREFIX + resourcePoolId] = [
          {
            val: constants.CUSTOM_PROPS.EPZ_VALUE,
            op: 'eq'
          }
        ];
      }
    }
  }

  return buildOdataQuery(qOps);
};

var buildClusterQuery = function(descriptionLink, compositionContextId) {
  let qOps = [];

  // Filter out Amazon parent hosts
  qOps.descriptionLink = [
    {
      op: 'eq',
      val: descriptionLink
    }
  ];

  if (compositionContextId) {
    qOps['customProperties/__composition_context_id'] = [
      {
        op: 'eq',
        val: compositionContextId
      }
    ];
  }

  return buildOdataQuery(qOps);
};

// TODO consider renaming to buildResourcesSearchQuery
var buildContainersSearchQuery = function(queryOptions) {
  var newQueryOptions = {};
  if (queryOptions) {
    newQueryOptions[constants.SEARCH_OCCURRENCE.PARAM] =
      queryOptions[constants.SEARCH_OCCURRENCE.PARAM];

    var anyArray = toArrayIfDefined(queryOptions.any);
    if (anyArray) {
      newQueryOptions[FILTER_VALUE_ALL_FIELDS] = [];
      for (let i = 0; i < anyArray.length; i++) {
        newQueryOptions[FILTER_VALUE_ALL_FIELDS].push({
          val: '*' + anyArray[i] + '*',
          op: 'eq'
        });
      }
    }

    var nameArray = toArrayIfDefined(queryOptions.name);
    if (nameArray) {
      var field = queryOptions[constants.SEARCH_CATEGORY_PARAM]
                  === constants.CONTAINERS.SEARCH_CATEGORY.CONTAINERS ? 'names/item' : 'name';
      newQueryOptions[field] = [];
      for (let i = 0; i < nameArray.length; i++) {
        newQueryOptions[field].push({
          val: '*' + nameArray[i] + '*',
          op: 'eq'
        });
      }
    }

    var idArray = toArrayIfDefined(queryOptions.id);
    if (idArray) {
      newQueryOptions.id = [];
      for (let i = 0; i < idArray.length; i++) {
        newQueryOptions.id.push({
          val: idArray[i] + '*',
          op: 'eq'
        });
      }
    }

    var documentIdArray = toArrayIfDefined(queryOptions.documentId);
    if (documentIdArray) {
      newQueryOptions.documentSelfLink = [];

      var link;
      var category = queryOptions[constants.SEARCH_CATEGORY_PARAM];
      switch (category) {
        case constants.RESOURCES.SEARCH_CATEGORY.NETWORKS:
          link = links.NETWORKS;
          break;
        case constants.RESOURCES.SEARCH_CATEGORY.APPLICATIONS:
          link = links.COMPOSITE_COMPONENTS;
          break;

        default:
        case constants.RESOURCES.SEARCH_CATEGORY.CONTAINERS:
          link = links.CONTAINERS;
          break;
      }

      for (let i = 0; i < documentIdArray.length; i++) {
        newQueryOptions.documentSelfLink.push({
          val: link + '/' + documentIdArray[i] + '*',
          op: 'eq'
        });
      }
    }

    var imageArray = toArrayIfDefined(queryOptions.image);
    if (imageArray) {
      newQueryOptions.image = [];
      for (let i = 0; i < imageArray.length; i++) {
        newQueryOptions.image.push({
          val: '*' + imageArray + '*',
          op: 'eq'
        });
      }
    }

    var parentIdArray = toArrayIfDefined(queryOptions.parentId);
    if (parentIdArray) {
      newQueryOptions.parentLink = [];
      for (let i = 0; i < parentIdArray.length; i++) {
        // We construct the parentLink to match '/resources/compute/id*'.
        newQueryOptions.parentLink.push({
          val: links.COMPUTE_RESOURCES + '/' + parentIdArray[i],
          op: 'eq'
        });
      }
    }

    var statusArray = toArrayIfDefined(queryOptions.status);
    if (statusArray) {
      // NOTE: the power state matching is case sensitive
      newQueryOptions.powerState = [];
      for (let i = 0; i < statusArray.length; i++) {
        newQueryOptions.powerState.push({
          val: '*' + statusArray[i].toUpperCase() + '*',
          op: 'eq'
        });
      }
    }

    var placementLinkArray = toArrayIfDefined(queryOptions.placement);
    if (placementLinkArray) {
      newQueryOptions.groupResourcePlacementLink = [];
      for (let i = 0; i < placementLinkArray.length; i++) {
        newQueryOptions.groupResourcePlacementLink.push({
          val: placementLinkArray[i] + '*',
          op: 'eq'
        });
      }
    }

    // used to view application's container list
    var compositeComponentLinkArray = toArrayIfDefined(queryOptions.compositeComponentLink);
    if (compositeComponentLinkArray) {
      newQueryOptions.compositeComponentLink = [];
      for (let i = 0; i < compositeComponentLinkArray.length; i++) {
        newQueryOptions.compositeComponentLink.push({
          val: compositeComponentLinkArray[i] + '*',
          op: 'eq'
        });
      }
    } else if (queryOptions[constants.SEARCH_CATEGORY_PARAM] ===
               constants.CONTAINERS.SEARCH_CATEGORY.CONTAINERS) {
      // TODO: issues with CAFE - all single provisioned containers have compositeComponentLink
      //      newQueryOptions.compositeComponentLink = [{
      //        val: '*',
      //        op: 'ne'
      //      }];

    }

    var networkArray = toArrayIfDefined(queryOptions.network);
    if (networkArray) {
      newQueryOptions.networks = [];
      for (let i = 0; i < networkArray.length; i++) {
        newQueryOptions.networks.push({
          val: '*' + networkArray[i] + '*',
          op: 'eq'
        });
      }
    }

  }
 return buildOdataQuery(newQueryOptions);

};

export default services;
