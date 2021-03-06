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

package track

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"admiral/client"
	"admiral/config"
	"admiral/events"
	"admiral/utils"
)

type FailureMessage struct {
	Message string `json:"message"`
}

type TaskInfo struct {
	Stage   string         `json:"stage"`
	Failure FailureMessage `json:"failure"`
}

type TaskStatus struct {
	TaskInfo      TaskInfo `json:"taskInfo"`
	Progress      int      `json:"progress"`
	Name          string   `json:"name"`
	SubStage      string   `json:"subStage"`
	EventLogLink  string   `json:"eventLogLink"`
	ResourceLinks []string `json:"resourceLinks"`
}

type OperationResponse struct {
	RequestTrackerLink string `json:"requestTrackerLink"`
}

func (or *OperationResponse) GetTracerId() string {
	id := strings.Replace(or.RequestTrackerLink, "/request-status/", "", 1)
	return id
}

func (or *OperationResponse) PrintTracerId() {
	fmt.Printf("%s Task ID: %s\n", time.Now().Format("2006.01.02 15:04:05"), or.GetTracerId())
}

func Wait(taskId string) ([]string, error) {
	url := config.URL + "/request-status/" + taskId
	req, _ := http.NewRequest("GET", url, nil)
	var (
		result        string
		errorMsg      string
		resourceLinks []string
	)

	pb := ProgressBar{
		Widht: 55,
	}
	pb.InitPrint()
	begin := time.Now()
	for {
		elapsed := time.Now().Sub(begin)
		if elapsed.Seconds() > float64(config.TASK_TIMEOUT) {
			return nil, errors.New("Task timed out.")
		}
		taskStatus := &TaskStatus{}
		_, respBody, respErr := client.ProcessRequest(req)
		if respErr != nil {
			return nil, respErr
		}
		err := json.Unmarshal(respBody, taskStatus)
		utils.CheckJson(err)
		pb.UpdateBar(taskStatus.Progress)
		if taskStatus.SubStage == "COMPLETED" {
			result = taskStatus.SubStage
			resourceLinks = taskStatus.ResourceLinks
			break
		} else if taskStatus.SubStage == "ERROR" {
			result = taskStatus.SubStage
			errorMsg, err = getErrorMessage(req)
			break
			if err != nil {
				return nil, err
			}
		}
		time.Sleep(1000 * time.Millisecond)
	}

	fmt.Printf("\n%s The task has %s.\n", time.Now().Format("2006.01.02 15:04:05"), result)

	if result == "ERROR" {
		if errorMsg != "" {
			return resourceLinks, errors.New(errorMsg)
		}
	}
	return resourceLinks, nil
}

func GetResLinks(taskId string) ([]string, error) {
	url := config.URL + "/request-status/" + taskId
	req, _ := http.NewRequest("GET", url, nil)
	var (
		result        string
		errorMsg      string
		resourceLinks []string
	)
	taskStatus := &TaskStatus{}
	_, respBody, respErr := client.ProcessRequest(req)
	if respErr != nil {
		return nil, respErr
	}
	err := json.Unmarshal(respBody, taskStatus)
	utils.CheckJson(err)
	if taskStatus.SubStage == "COMPLETED" {
		result = taskStatus.SubStage
	} else if taskStatus.SubStage == "ERROR" {
		result = taskStatus.SubStage
		errorMsg, err = getErrorMessage(req)
		if err != nil {
			return nil, err
		}
	}
	resourceLinks = taskStatus.ResourceLinks

	if result == "ERROR" {
		if errorMsg != "" {
			return resourceLinks, errors.New(errorMsg)
		}
	}
	return resourceLinks, nil
}

func getErrorMessage(statusReq *http.Request) (string, error) {
	//Wait because sometimes event log link is not generated.
	time.Sleep(1 * time.Second)
	_, respBody, respErr := client.ProcessRequest(statusReq)
	if respErr != nil {
		return "", respErr
	}
	taskStatus := &TaskStatus{}
	err := json.Unmarshal(respBody, taskStatus)
	utils.CheckJson(err)
	if taskStatus.EventLogLink == "" {
		return "", errors.New("No event log link.")
	}
	url := config.URL + taskStatus.EventLogLink
	req, _ := http.NewRequest("GET", url, nil)
	_, respBody, respErr = client.ProcessRequest(req)
	if respErr != nil {
		return "", respErr
	}
	event := &events.EventInfo{}
	err = json.Unmarshal(respBody, event)
	utils.CheckJson(err)
	return event.Description, nil
}

type ProgressBar struct {
	Widht int
}

func (pb *ProgressBar) InitPrint() {
	fmt.Print("|>")
	for i := 0; i < pb.Widht; i++ {
		fmt.Print("-")
	}
	fmt.Print("|")
}

func (pb *ProgressBar) UpdateBar(percentage int) {
	fmt.Print("\r|")
	result := int((float32(percentage) / 100) * float32(pb.Widht))
	if result == pb.Widht && percentage == 100 {
		pb.FillUp()
		return
	}
	for i := 0; i < result; i++ {
		fmt.Print("=")
	}
	fmt.Print(">")
	for i := result; i < pb.Widht; i++ {
		fmt.Print("-")
	}
	fmt.Print("|    ", percentage, "%")
}

func (pb *ProgressBar) FillUp() {
	fmt.Print("\r|")
	for i := 0; i < pb.Widht; i++ {
		fmt.Print("=")
	}
	fmt.Print(">|    ", 100, "%")
}
