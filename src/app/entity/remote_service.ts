/*
  Copyright (C) 2022 Suwings <Suwings@outlook.com>

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.
  
  According to the AGPL, it is forbidden to delete all copyright notices, 
  and if you modify the source code, you must open source the
  modified source code.

  版权所有 (C) 2022 Suwings <Suwings@outlook.com>

  该程序是免费软件，您可以重新分发和/或修改据 GNU Affero 通用公共许可证的条款，
  由自由软件基金会，许可证的第 3 版，或（由您选择）任何更高版本。

  根据 AGPL 与用户协议，您必须保留所有版权声明，如果修改源代码则必须开源修改后的源代码。
  可以前往 https://mcsmanager.com/ 阅读用户协议，申请闭源开发授权等。
*/

import * as io from "socket.io-client";
import { RemoteServiceConfig } from "./entity_interface";
import { logger } from "../service/log";
import RemoteRequest from "../service/remote_command";
import InstanceStreamListener from "../common/instance_stream";
import { $t } from "../i18n";

export default class RemoteService {
  public static readonly STATUS_OK = 200;
  public static readonly STATUS_ERR = 500;

  public uuid: string = null;
  public available: boolean = false;
  public socket: SocketIOClient.Socket = null;
  public readonly instanceStream = new InstanceStreamListener();
  public config: RemoteServiceConfig;

  constructor(uuid: string, config: RemoteServiceConfig) {
    this.uuid = uuid;
    this.config = config;
  }

  // 连接远程服务
  public connect(connectOpts?: SocketIOClient.ConnectOpts) {
    if (connectOpts) this.config.connectOpts = connectOpts;
    // 开始正式连接远程Socket程序
    let addr = `ws://${this.config.ip}:${this.config.port}`;
    if (this.config.ip.indexOf("wss://") === 0 || this.config.ip.indexOf("ws://") === 0) {
      addr = `${this.config.ip}:${this.config.port}`;
    }
    const daemonInfo = `[${this.uuid}] [${addr}]`;

    if (this.available) {
      logger.info(`${$t("daemonInfo.resetConnect")}:${daemonInfo}`);
      this.disconnect();
    }

    // 防止重复注册事件
    if (this.socket && this.socket.hasListeners("connect")) {
      logger.info(`${$t("daemonInfo.replaceConnect")}:${daemonInfo}`);
      return this.refreshReconnect();
    }

    logger.info(`${$t("daemonInfo.tryConnect")}:${daemonInfo}`);
    this.socket = io.connect(addr, connectOpts);

    // 注册内置事件
    this.socket.on("connect", async () => {
      logger.info($t("daemonInfo.connect", { v: daemonInfo }));
      await this.onConnect();
    });
    this.socket.on("disconnect", async () => {
      logger.info($t("daemonInfo.disconnect", { v: daemonInfo }));
      await this.onDisconnect();
    });
    this.socket.on("connect_error", async (error: string) => {
      await this.onDisconnect();
    });
  }

  // This function is used to verify the identity. It only needs to be verified once.
  // This function will be executed automatically after the connection event is triggered.
  // Generally, there is no need to execute it manually.
  public async auth(key?: string) {
    if (key) this.config.apiKey = key;
    const daemonInfo = `[${this.uuid}] [${this.config.ip}:${this.config.port}]`;
    try {
      const res = await new RemoteRequest(this).request("auth", this.config.apiKey, 5000, true);
      if (res === true) {
        this.available = true;
        logger.info($t("daemonInfo.connect", { v: daemonInfo }));
        return true;
      }
      this.available = false;
      logger.warn($t("daemonInfo.disconnect", { v: daemonInfo }));
      return false;
    } catch (error) {
      logger.warn($t("daemonInfo.connectError", { v: daemonInfo }));
      return false;
    }
  }

  public emit(event: string, data?: any) {
    return this.socket.emit(event, data);
  }

  private async onDisconnect() {
    this.available = false;
  }

  private async onConnect() {
    // this.available = true; Note: Connected is not auth;
    return await this.auth(this.config.apiKey);
  }

  disconnect() {
    if (this.socket) {
      const daemonInfo = `[${this.uuid}] [${this.config.ip}:${this.config.port}]`;
      logger.info($t("daemonInfo.closed", { v: daemonInfo }));
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket.close();
      delete this.socket;
    }
    this.socket = null;
    this.available = false;
  }

  refreshReconnect() {
    this.disconnect();
    this.connect();
  }
}
