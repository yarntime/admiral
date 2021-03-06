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

package utils

import (
	"fmt"
	"os"
	"runtime"

	"github.com/mitchellh/go-homedir"
)

const WINDOWS_PATH_SEPARATOR = "\\"

const UNIX_PATH_SEPARATOR = "/"

func TokenPath() string {
	return CliDir() + "admiral-cli.token"
}

func ConfigPath() string {
	return CliDir() + "admiral-cli.config"
}

func TrustedCertsPath() string {
	return CliDir() + "trusted-certs.pem"
}

func CliDir() string {
	home := GetHome()
	if runtime.GOOS == "windows" {
		return home + WINDOWS_PATH_SEPARATOR + ".admiral-cli" + WINDOWS_PATH_SEPARATOR
	} else {
		return home + UNIX_PATH_SEPARATOR + ".admiral-cli" + UNIX_PATH_SEPARATOR
	}
}

func MkCliDir() bool {
	err := os.MkdirAll(CliDir(), 0777)
	if err != nil {
		fmt.Println(err.Error())
		return false
	}
	return true
}

func GetHome() string {
	home, err := homedir.Dir()
	if err != nil {
		fmt.Println(err.Error())
		os.Exit(0)
	}
	return home
}
