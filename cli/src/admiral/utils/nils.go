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
	"encoding/json"
)

type NilInt64 struct {
	Value int64
}

func (n NilInt64) MarshalJSON() ([]byte, error) {
	if n.Value == 0 {
		return json.Marshal(nil)
	}
	return json.Marshal(n.Value)
}

type NilInt32 struct {
	Value int32
}

func (n NilInt32) MarshalJSON() ([]byte, error) {
	if n.Value == 0 {
		return json.Marshal(nil)
	}
	return json.Marshal(n.Value)
}

type NilString struct {
	Value string
}

func (n NilString) MarshalJSON() ([]byte, error) {
	if n.Value == "" {
		return json.Marshal(nil)
	}
	return json.Marshal(n.Value)
}
