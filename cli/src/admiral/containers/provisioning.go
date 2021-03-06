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

package containers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"strings"

	"admiral/client"
	"admiral/config"
	"admiral/images"
	"admiral/track"
	"admiral/utils"
	"errors"
)

type LogConfig struct {
	Type utils.NilString `json:"type"`
}

func (lc *LogConfig) SetType(s string) error {
	if s == "" || s == "none" || s == "json-file" ||
		s == "syslog" || s == "journald" || s == "gelf" ||
		s == "fluentd" || s == "awslogs" || s == "splunk" ||
		s == "etwlogs" || s == "gcplogs" {
		lc.Type = utils.NilString{s}
		return nil
	}
	return errors.New("Invalid log driver.")
}

//Note: nil types are from "admiral/nulls" package.
//Note: "dot import" is used for cleaner code.
type ContainerDescription struct {
	Image              utils.NilString `json:"image"`
	Name               utils.NilString `json:"name"`
	ClusterSize        utils.NilInt32  `json:"_cluster"`
	Commands           []string        `json:"command"`
	CpuShares          utils.NilString `json:"cpuShares"`
	DeploymentPolicyID utils.NilString `json:"deploymentPolicyId"`
	Env                []string        `json:"env"`
	ExposeServices     []string        `json:"exposeService"`
	Hostname           utils.NilString `json:"hostname"`
	Links              []string        `json:"links"`
	LogConfig          LogConfig       `json:"logConfig"`
	MaximumRetryCount  utils.NilInt32  `json:"maximumRetryCount"`
	MemoryLimit        utils.NilInt64  `json:"memoryLimit"`
	MemorySwapLimit    utils.NilInt64  `json:"memorySwapLimit"`
	NetworkMode        utils.NilString `json:"networkMode"`
	PortBindings       []Port          `json:"portBindings"`
	PublishAll         bool            `json:"publishAll"`
	RestartPolicy      utils.NilString `json:"restartPolicy"`
	WorkingDir         utils.NilString `json:"workingDir"`
	Volumes            []string        `json:"volumes"`
}

func (cd *ContainerDescription) SetImage(imageName string) error {
	if imageName == "" {
		return errors.New("Empty image name.")
	}
	cd.Image = utils.NilString{imageName}
	return nil
}

func (cd *ContainerDescription) SetName(name string) error {
	if name == "" && cd.Image.Value != "" {
		splittedImageName := strings.Split(cd.Image.Value, "/")
		nameToSet := splittedImageName[len(splittedImageName)-1]
		cd.Name = utils.NilString{nameToSet}
		return nil
	}
	if name == "" {
		return errors.New("Empty container name.")
	}
	cd.Name = utils.NilString{name}
	return nil
}

func (cd *ContainerDescription) SetClusterSize(clusterSize int32) error {
	if clusterSize <= 0 {
		return errors.New("Cluster size cannot be negative or 0 number.")
	}
	cd.ClusterSize = utils.NilInt32{clusterSize}
	return nil
}

func (cd *ContainerDescription) SetCommands(commands []string) {
	cd.Commands = commands
}

func (cd *ContainerDescription) SetCpuShares(cpuShares string) {
	cd.CpuShares = utils.NilString{cpuShares}
}

func (cd *ContainerDescription) SetDeploymentPolicyId(dpId string) {
	cd.DeploymentPolicyID = utils.NilString{dpId}
}

func (cd *ContainerDescription) SetEnvVars(envVars []string) {
	if len(envVars) == 0 {
		cd.Env = nil
	}
	cd.Env = envVars
}

func (cd *ContainerDescription) SetExposeServices(exposeServices []string) {
	if len(exposeServices) == 0 {
		cd.ExposeServices = nil
	}
	cd.ExposeServices = exposeServices
}

func (cd *ContainerDescription) SetHostName(hostName string) {
	cd.Hostname = utils.NilString{hostName}
}

func (cd *ContainerDescription) SetLinks(links []string) {
	if len(links) == 0 {
		cd.Links = nil
	}
	cd.Links = links
}

func (cd *ContainerDescription) SetLogConfig(logDriver string) error {
	logconf := LogConfig{}
	err := logconf.SetType(logDriver)
	if err != nil {
		return err
	}
	cd.LogConfig = logconf
	return nil
}

func (cd *ContainerDescription) SetMaxRetryCount(maxRetries int32) {
	cd.MaximumRetryCount = utils.NilInt32{maxRetries}
}

func (cd *ContainerDescription) SetMemoryLimit(memoryLimit int64) error {
	if memoryLimit < 0 {
		return errors.New("Memory limit cannot be negative number.")
	}
	if memoryLimit > 0 && memoryLimit < 4194304 {
		return errors.New("Memory limit should be at least 4194304 bytes (4MB)")
	}
	cd.MemoryLimit = utils.NilInt64{memoryLimit}
	return nil
}

func (cd *ContainerDescription) SetMemorySwapLimit(memorySwapLimit int64) error {
	if memorySwapLimit <= -1 {
		return errors.New("Memory swap limit cannot be less than -1.")
	}
	cd.MemorySwapLimit = utils.NilInt64{memorySwapLimit}
	return nil
}

func (cd *ContainerDescription) SetNetworkMode(networkMode string) error {
	if networkMode != "none" && networkMode != "host" && networkMode != "bridge" {
		return errors.New("Invalid network mode.")
	}
	cd.NetworkMode = utils.NilString{networkMode}
	return nil
}

func (cd *ContainerDescription) SetPortBindings(ports []string) {
	portArr := make([]Port, 0)
	if len(ports) > 0 {
		for _, p := range ports {
			currPort := Port{}
			currPort.SetPorts(p)
			portArr = append(portArr, currPort)
		}
		cd.PortBindings = portArr
	} else {
		cd.PortBindings = nil
	}
}

func (cd *ContainerDescription) SetPublishAll(publishAll bool) {
	cd.PublishAll = publishAll
}

func (cd *ContainerDescription) SetRestartPolicy(restartPolicy string) error {
	if restartPolicy != "no" && restartPolicy != "always" && restartPolicy != "on-failure" {
		return errors.New("Invalid restart policy.")
	}
	cd.RestartPolicy = utils.NilString{restartPolicy}
	return nil
}

func (cd *ContainerDescription) SetWorkingDir(workingDir string) {
	cd.WorkingDir = utils.NilString{workingDir}
}

func (cd *ContainerDescription) SetVolumes(volumes []string) {
	if len(volumes) == 0 {
		cd.Volumes = nil
	}
	cd.Volumes = volumes
}

func (cd *ContainerDescription) RunContainer(projectId string, asyncTask bool) (string, error) {
	linkToRun, err := getContaierRunLink(cd)
	if err != nil {
		return "", err
	}
	var tenantLinks []string
	if projectId != "" {
		tenantLinks = make([]string, 0)
		projectLink := utils.CreateResLinkForProject(projectId)
		tenantLinks = append(tenantLinks, projectLink)
	}
	url := config.URL + "/requests"
	runContainer := &RunContainer{
		ResourceType:            "DOCKER_CONTAINER",
		ResourceDescriptionLink: linkToRun,
		TenantLinks:             tenantLinks,
	}

	jsonBody, err := json.MarshalIndent(runContainer, "", "    ")
	utils.CheckJson(err)

	req, _ := http.NewRequest("POST", url, bytes.NewBuffer(jsonBody))
	_, respBody, respErr := client.ProcessRequest(req)
	if respErr != nil {
		return "", respErr
	}
	taskStatus := &track.OperationResponse{}
	_ = json.Unmarshal(respBody, taskStatus)
	taskStatus.PrintTracerId()
	if !asyncTask {
		resLinks, err = track.Wait(taskStatus.GetTracerId())
	} else {
		resLinks, err = track.GetResLinks(taskStatus.GetTracerId())
	}
	if len(resLinks) > 0 {
		return utils.GetResourceID(resLinks[0]), err
	}
	return "", err

}

func getContaierRunLink(cd *ContainerDescription) (string, error) {
	var runLink string
	url := config.URL + "/resources/container-descriptions"
	jsonBody, err := json.MarshalIndent(cd, "", "    ")
	utils.CheckJson(err)
	req, _ := http.NewRequest("POST", url, bytes.NewBuffer(jsonBody))
	req.Header.Set("Pragma", "xn-force-index-update")
	_, respBody, respErr := client.ProcessRequest(req)
	if respErr != nil {
		return "", respErr
	}
	image := &images.Image{}
	_ = json.Unmarshal(respBody, image)
	runLink = image.DocumentSelfLink
	return runLink, nil

}
