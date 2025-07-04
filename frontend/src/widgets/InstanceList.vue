<script setup lang="ts">
import type { LayoutCard } from "@/types/index";
import { ref, onMounted, computed, h } from "vue";
import { t } from "@/lang/i18n";
import {
  SearchOutlined,
  DownOutlined,
  FormOutlined,
  DatabaseOutlined,
  AppstoreOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  CloseOutlined,
  DeleteOutlined,
  WarningOutlined,
  InfoCircleOutlined,
  FrownOutlined,
  RedoOutlined
} from "@ant-design/icons-vue";

import BetweenMenus from "@/components/BetweenMenus.vue";
import { router } from "@/config/router";
import { remoteInstances, remoteNodeList } from "@/services/apis";
import {
  batchStart,
  batchStop,
  batchKill,
  batchDelete,
  batchRestart
} from "@/services/apis/instance";
import type { NodeStatus } from "../types/index";
import { notification, Modal } from "ant-design-vue";
import { computeNodeName } from "../tools/nodes";
import type { InstanceMoreDetail } from "../hooks/useInstance";
import { useInstanceMoreDetail } from "../hooks/useInstance";
import { throttle } from "lodash";
import { useScreen } from "@/hooks/useScreen";
import { reportErrorMsg } from "@/tools/validator";
import { INSTANCE_STATUS } from "@/types/const";
import Shortcut from "./instance/Shortcut.vue";
import { useInstanceTagSearch, useInstanceTagTips } from "@/hooks/useInstanceTag";

defineProps<{
  card: LayoutCard;
}>();

const { isPhone } = useScreen();
const operationForm = ref({
  instanceName: "",
  currentPage: 1,
  pageSize: 20,
  status: ""
});

const currentRemoteNode = ref<NodeStatus>();

const { execute: getNodes, state: nodes, isLoading: isLoading1 } = remoteNodeList();
const { execute: getInstances, state: instances, isLoading: isLoading2 } = remoteInstances();
const { updateTagTips, tagTips } = useInstanceTagTips();
const {
  tags: selectedTags,
  setRefreshFn,
  selectTag,
  removeTag,
  isTagSelected,
  clearTags
} = useInstanceTagSearch();

const isLoading = computed(() => isLoading1.value || isLoading2.value);

const instancesMoreInfo = computed(() => {
  const newInstances: InstanceMoreDetail[] = [];
  for (const instance of instances.value?.data || []) {
    const instanceMoreInfo = useInstanceMoreDetail(instance);
    newInstances.push(instanceMoreInfo);
  }
  return newInstances || [];
});

const initNodes = async () => {
  await getNodes();
  nodes?.value?.sort((a, b) => (a.available === b.available ? 0 : a.available ? -1 : 1));
  if (nodes.value?.length === 0) {
    return reportErrorMsg(t("TXT_CODE_e3d96a26"));
  }
  if (localStorage.getItem("pageSelectedRemote")) {
    currentRemoteNode.value = JSON.parse(localStorage.pageSelectedRemote);
    if (!nodes.value?.some((item) => item.uuid === currentRemoteNode.value?.uuid)) {
      currentRemoteNode.value = undefined;
    }
  } else {
    currentRemoteNode.value = nodes.value?.[0];
  }
};

const initInstancesData = async (resetPage?: boolean) => {
  try {
    selectedInstance.value = [];
    if (resetPage) operationForm.value.currentPage = 1;
    if (!currentRemoteNode.value) {
      await initNodes();
    }
    await getInstances({
      params: {
        daemonId: currentRemoteNode.value?.uuid ?? "",
        page: operationForm.value.currentPage,
        page_size: operationForm.value.pageSize,
        status: operationForm.value.status,
        instance_name: operationForm.value.instanceName.trim(),
        tag: JSON.stringify(selectedTags.value)
      }
    });
    updateTagTips(instances.value?.allTags || []);
  } catch (err) {
    return reportErrorMsg(t("TXT_CODE_e109c091"));
  }
};

const handleQueryInstance = throttle(async () => {
  selectedInstance.value = [];
  await initInstancesData();
}, 600);

const toAppDetailPage = (daemonId: string, instanceId: string) => {
  router.push({
    path: `/instances/terminal`,
    query: {
      daemonId,
      instanceId
    }
  });
};

const handleChangeNode = async (item: NodeStatus) => {
  try {
    currentRemoteNode.value = item;
    selectedInstance.value = [];
    await initInstancesData(true);
    localStorage.setItem("pageSelectedRemote", JSON.stringify(item));
  } catch (err: any) {
    console.error(err.message);
  }
};

const toCreateAppPage = () => {
  router.push({
    path: "/quickstart",
    query: {
      daemonId: currentRemoteNode.value?.uuid
    }
  });
};

const toNodesPage = () => {
  router.push({
    path: "/node"
  });
};

const multipleMode = ref(false);
const selectedInstance = ref<InstanceMoreDetail[]>([]);

const findInstance = (item: InstanceMoreDetail) => {
  return selectedInstance.value.find((i) => i.instanceUuid === item.instanceUuid);
};

const selectInstance = (item: InstanceMoreDetail) => {
  if (findInstance(item)) {
    selectedInstance.value.splice(selectedInstance.value.indexOf(item), 1);
  } else {
    selectedInstance.value.push(item);
  }
};

const handleSelectInstance = (item: InstanceMoreDetail) => {
  if (multipleMode.value) {
    selectInstance(item);
  } else {
    toAppDetailPage(currentRemoteNode.value?.uuid || "", item.instanceUuid);
  }
};

const selectAllInstances = () => {
  if (instancesMoreInfo.value.length === selectedInstance.value.length) {
    selectedInstance.value = [];
  } else {
    for (const item of instancesMoreInfo.value) {
      if (findInstance(item)) continue;
      selectedInstance.value.push(item);
    }
  }
};

const exitMultipleMode = () => {
  multipleMode.value = false;
  selectedInstance.value = [];
};

const instanceOperations = [
  {
    title: t("TXT_CODE_57245e94"),
    icon: PlayCircleOutlined,
    click: () => batchOperation("start")
  },
  {
    title: t("TXT_CODE_b1dedda3"),
    icon: PauseCircleOutlined,
    click: () => batchOperation("stop")
  },
  {
    title: t("TXT_CODE_47dcfa5"),
    icon: RedoOutlined,
    click: () => batchOperation("restart")
  },
  {
    title: t("TXT_CODE_7b67813a"),
    icon: CloseOutlined,
    click: () => {
      batchOperation("kill");
    }
  },
  {
    title: t("TXT_CODE_ecbd7449"),
    icon: DeleteOutlined,
    click: () => batchDeleteInstance(false)
  },
  {
    title: t("TXT_CODE_9ef27367"),
    icon: WarningOutlined,
    click: () => batchDeleteInstance(true)
  }
];

const batchOperation = async (actName: "start" | "stop" | "kill" | "restart") => {
  if (selectedInstance.value.length === 0) return reportErrorMsg(t("TXT_CODE_a0a77be5"));
  const operationMap = {
    start: async () => exec(batchStart().execute, t("TXT_CODE_2b5fd76e")),
    stop: async () => exec(batchStop().execute, t("TXT_CODE_4822a21")),
    kill: async () => exec(batchKill().execute, t("TXT_CODE_effefaab")),
    restart: async () => exec(batchRestart().execute, t("TXT_CODE_effefaab"))
  };

  const exec = async (fn: Function, msg: string) => {
    try {
      const state = await fn({
        data: selectedInstance.value.map((item) => ({
          instanceUuid: item.instanceUuid,
          daemonId: currentRemoteNode.value?.uuid ?? ""
        }))
      });
      if (state.value) {
        notification.success({
          message: msg,
          description: t("TXT_CODE_1514d08f")
        });
        exitMultipleMode();
        await initInstancesData();
      }
    } catch (err: any) {
      console.error(err);
      reportErrorMsg(err.message);
    }
  };

  operationMap[actName]();
};

const batchDeleteInstance = async (deleteFile: boolean) => {
  if (selectedInstance.value.length === 0) return reportErrorMsg(t("TXT_CODE_a0a77be5"));
  const { execute, state } = batchDelete();
  const uuids: string[] = [];
  const paths: string[] = [];
  for (const i of selectedInstance.value) {
    uuids.push(i.instanceUuid);
    if (i.config?.cwd) {
      paths.push(i.config.cwd);
    }
  }
  const confirmDeleteInstanceModal = Modal.confirm({
    title: t("TXT_CODE_2a3b0c17"),
    icon: h(InfoCircleOutlined),
    content: () => h("div", {}, [
      h("p", {}, deleteFile ? t("TXT_CODE_18d2f8ae") : t("TXT_CODE_ac01315a")),
      h("p", { style: "margin-top: 8px; color: #666;" }, [
        t("TXT_CODE_91d70059"),
        h("br"),
        paths.join()
      ])
    ]),
    okText: t("TXT_CODE_d507abff"),
    async onOk() {
      try {
        await execute({
          params: {
            daemonId: currentRemoteNode.value?.uuid ?? ""
          },
          data: {
            uuids: uuids,
            deleteFile: deleteFile
          }
        });
        if (state.value) {
          confirmDeleteInstanceModal.destroy();
          exitMultipleMode();
          notification.success({
            message: t("TXT_CODE_c3c06801"),
            description: t("TXT_CODE_50075e02")
          });
          await initInstancesData(true);
        }
      } catch (err: any) {
        console.error(err);
        reportErrorMsg(err.message);
      }
    },
    onCancel() {}
  });
};

onMounted(async () => {
  await initInstancesData();
  setRefreshFn(initInstancesData);
});
</script>

<template>
  <div style="height: 100%" class="container">
    <a-row :gutter="[24, 24]" style="height: 100%">
      <a-col :span="24">
        <BetweenMenus>
          <template v-if="!isPhone" #left>
            <a-typography-title class="mb-0" :level="4">
              <AppstoreOutlined />
              {{ card.title }}
            </a-typography-title>
          </template>
          <template #right>
            <a-dropdown>
              <template #overlay>
                <a-menu>
                  <a-menu-item
                    v-for="item in nodes"
                    :key="item.uuid"
                    :disabled="!item.available"
                    @click="handleChangeNode(item)"
                  >
                    <DatabaseOutlined v-if="item.available" />
                    <FrownOutlined v-else />
                    {{ computeNodeName(item.ip, item.available, item.remarks) }}
                  </a-menu-item>
                  <a-menu-divider />
                  <a-menu-item key="toNodesPage" @click="toNodesPage()">
                    <FormOutlined />
                    {{ t("TXT_CODE_28e53fed") }}
                  </a-menu-item>
                </a-menu>
              </template>
              <a-button style="max-width: 200px; min-width: 180px; overflow: hidden">
                <a-typography-text
                  style="max-width: 145px"
                  :ellipsis="{ ellipsis: true }"
                  :content="
                    computeNodeName(
                      currentRemoteNode?.ip || '',
                      currentRemoteNode?.available || true,
                      currentRemoteNode?.remarks
                    )
                  "
                />
                <DownOutlined />
              </a-button>
            </a-dropdown>
            <a-button
              type="primary"
              :disabled="!currentRemoteNode?.available"
              @click="toCreateAppPage"
            >
              {{ t("TXT_CODE_53408064") }}
            </a-button>
          </template>
          <template #center>
            <div class="search-input">
              <a-input-group compact>
                <a-select
                  v-model:value="operationForm.status"
                  style="width: 90px"
                  @change="handleQueryInstance"
                >
                  <a-select-option value="">
                    {{ t("TXT_CODE_c48f6f64") }}
                  </a-select-option>
                  <a-select-option v-for="(p, i) in INSTANCE_STATUS" :key="i" :value="i">
                    {{ p }}
                  </a-select-option>
                </a-select>
                <a-input
                  v-model:value.trim="operationForm.instanceName"
                  :placeholder="t('TXT_CODE_ce132192')"
                  style="width: calc(100% - 90px)"
                  @press-enter="handleQueryInstance"
                  @change="handleQueryInstance"
                >
                  <template #suffix>
                    <search-outlined />
                  </template>
                </a-input>
              </a-input-group>
            </div>
          </template>
        </BetweenMenus>
      </a-col>
      <a-col :span="24">
        <BetweenMenus>
          <template v-if="instances" #left>
            <div v-if="multipleMode">
              <a-button class="mr-10" @click="exitMultipleMode">
                {{ t("TXT_CODE_5366af54") }}
              </a-button>

              <a-button
                v-if="instancesMoreInfo.length === selectedInstance.length"
                class="mr-10"
                @click="selectedInstance = []"
              >
                {{ t("TXT_CODE_df87c46d") }}
              </a-button>
              <a-button v-else class="mr-10" @click="selectAllInstances">
                {{ t("TXT_CODE_f466d7a") }}
              </a-button>
              <a-dropdown>
                <template #overlay>
                  <a-menu>
                    <a-menu-item
                      v-for="item in instanceOperations"
                      :key="item.title"
                      @click="item.click"
                    >
                      <component :is="item.icon" />
                      {{ item.title }}
                    </a-menu-item>
                  </a-menu>
                </template>
                <a-button type="primary">
                  {{ t("TXT_CODE_8fd8bfd3") }}
                  <DownOutlined />
                </a-button>
              </a-dropdown>
            </div>
            <div v-else>
              <a-button @click="multipleMode = true">{{ t("TXT_CODE_5cb656b9") }}</a-button>
              <a-button class="ml-10" @click="handleQueryInstance">
                {{ t("TXT_CODE_b76d94e0") }}
              </a-button>
            </div>
          </template>
          <template v-if="multipleMode" #center>
            <a-typography-text>
              {{ t("TXT_CODE_432cbc38") }}{{ selectedInstance.length }} {{ t("TXT_CODE_5cd3b4bd") }}
            </a-typography-text>
          </template>
          <template v-if="instances" #right>
            <a-pagination
              v-model:current="operationForm.currentPage"
              v-model:pageSize="operationForm.pageSize"
              :total="(instances?.maxPage || 0) * operationForm.pageSize"
              show-size-changer
              @change="initInstancesData()"
            />
          </template>
        </BetweenMenus>
      </a-col>
      <a-col :span="24">
        <div v-if="tagTips && tagTips?.length > 0" class="instances-tag-container">
          <a-tag
            v-if="selectedTags.length > 0"
            color="red"
            class="group-name-tag"
            @click="clearTags"
          >
            {{ t("TXT_CODE_7333c7f7") }}
          </a-tag>
          <a-tag
            v-for="item in tagTips"
            :key="item"
            class="group-name-tag"
            :class="{ 'group-name-tag-active': isTagSelected(item) }"
            @click="isTagSelected(item) ? removeTag(item) : selectTag(item)"
          >
            {{ item }}
          </a-tag>
        </div>
      </a-col>
      <template v-if="isLoading">
        <Loading></Loading>
      </template>
      <template v-else-if="instancesMoreInfo.length > 0">
        <fade-up-animation>
          <a-col
            v-for="item in instancesMoreInfo"
            :key="item.instanceUuid"
            :span="24"
            :xl="8"
            :lg="8"
            :sm="12"
          >
            <Shortcut
              class="instance-card"
              :class="{ selected: multipleMode && findInstance(item) }"
              style="height: 100%"
              :card="card"
              :target-instance-info="item"
              :target-daemon-id="currentRemoteNode?.uuid"
              @click="handleSelectInstance(item)"
              @refresh-list="initInstancesData()"
            />
          </a-col>
        </fade-up-animation>
      </template>
      <div
        v-else-if="instancesMoreInfo.length === 0"
        class="flex align-center justify-center h-100 w-100"
      >
        <Empty :description="t('TXT_CODE_5415f009')" />
      </div>
    </a-row>
  </div>
</template>

<style lang="scss" scoped>
.search-input {
  transition: all 0.6s;
  text-align: center;
  width: 80%;
}

@media (max-width: 992px) {
  .search-input {
    transition: all 0.4s;
    text-align: center;
    width: 100% !important;
  }
}

.search-input:hover {
  width: 100%;
}

.selected {
  border: 1px solid var(--color-blue-6);
  user-select: none;

  &:hover {
    border: 1px solid var(--color-blue-6);
    transition: all 0.3s;
    box-shadow: inset 0 0 0 0.5px var(--color-blue-6);
  }
}

.instances-tag-container {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  margin-right: -4px;
  margin-left: -4px;
  max-height: 114px;
  overflow-y: auto;

  .group-name-tag {
    background-color: var(--color-gray-4);
    margin: 4px;
    padding: 4px 8px;
    cursor: pointer;
    transition: all 0.3s;
    &:hover {
      border-color: var(--color-gray-8);
    }
  }

  .group-name-tag-active {
    background-color: var(--color-green-1) !important;
    border-color: var(--color-green-3);
    color: var(--color-green-7);
  }
}
</style>
