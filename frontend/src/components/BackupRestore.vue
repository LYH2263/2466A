<template>
  <div class="backup-restore-card">
    <div class="card-header">
      <div class="card-title">
        <el-icon :size="20" color="#409eff"><Promotion /></el-icon>
        <span>数据备份与恢复</span>
      </div>
      <el-tag size="small" type="info">v{{ schemaInfo?.version || '1.0.0' }}</el-tag>
    </div>

    <el-tabs v-model="activeTab" type="card">
      <el-tab-pane label="导出备份" name="export">
        <div class="export-section">
          <el-alert
            type="info"
            :closable="false"
            show-icon
            class="info-alert"
          >
            将导出您账户下的全部数据：资产记录、类别、标签、目标、负债、资金流、配置等。文件包含版本号与校验码，用于数据迁移与安全备份。
          </el-alert>

          <el-button
            type="primary"
            size="large"
            :icon="Download"
            :loading="exporting"
            style="margin-top: 24px; width: 100%;"
            @click="handleExport"
          >
            {{ exporting ? '正在生成备份文件...' : '一键导出全部数据' }}
          </el-button>

          <div v-if="schemaInfo" class="schema-info">
            <div class="info-item">
              <span class="label">支持策略</span>
              <span class="value">{{ schemaInfo.supportedStrategies.map(s => s === 'merge' ? '合并' : '覆盖').join(' / ') }}</span>
            </div>
            <div class="info-item">
              <span class="label">单文件上限</span>
              <span class="value">{{ schemaInfo.maxSizeMB }} MB</span>
            </div>
            <div class="info-item">
              <span class="label">数据类型</span>
              <span class="value">{{ schemaInfo.entities.length }} 类</span>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="恢复数据" name="import">
        <div class="import-section" v-if="!validateResult">
          <el-alert
            type="warning"
            :closable="false"
            show-icon
            class="info-alert"
          >
            <div>请上传 .json 格式的备份文件。</div>
            <div style="margin-top: 4px; font-size: 12px; opacity: 0.85;">
              恢复操作将先进行差异预览，您可确认后再执行。建议在恢复前先导出当前数据作为临时备份。
            </div>
          </el-alert>

          <el-upload
            drag
            action=""
            :auto-upload="false"
            :on-change="handleFileChange"
            :on-exceed="handleFileExceed"
            :limit="1"
            accept=".json,application/json"
            :show-file-list="true"
            class="upload-area"
            style="margin-top: 24px;"
          >
            <el-icon class="upload-icon" :size="48"><UploadFilled /></el-icon>
            <div class="el-upload__text">
              将备份文件拖到此处，或 <em>点击上传</em>
            </div>
            <template #tip>
              <div class="upload-tip">
                仅支持资产备份系统导出的 JSON 文件，最大 {{ schemaInfo?.maxSizeMB || 50 }}MB
              </div>
            </template>
          </el-upload>

          <div v-if="uploadError" class="upload-error">
            <el-alert type="error" :closable="false" show-icon :title="uploadError" />
          </div>
        </div>

        <div v-else class="preview-section">
          <el-card shadow="never" class="backup-info-card">
            <template #header>
              <div class="backup-info-header">
                <el-icon color="#67c23a" :size="18"><CircleCheckFilled /></el-icon>
                <span>文件校验通过</span>
                <el-tag
                  size="small"
                  :type="integrityTagType"
                  effect="light"
                  style="margin-left: auto;"
                >
                  {{ integrityTagText }}
                </el-tag>
              </div>
            </template>
            <div class="backup-info-grid">
              <div class="info-row">
                <span class="label">备份版本</span>
                <span class="value">v{{ validateResult.backup.version }}</span>
              </div>
              <div class="info-row">
                <span class="label">导出时间</span>
                <span class="value">{{ formatDate(validateResult.backup.exportedAt) }}</span>
              </div>
              <div class="info-row">
                <span class="label">导出用户</span>
                <span class="value">{{ validateResult.backup.exportedBy.userEmail }}</span>
              </div>
              <div class="info-row">
                <span class="label">数据总量</span>
                <span class="value">{{ totalBackupCount }} 条</span>
              </div>
            </div>
          </el-card>

          <el-alert
            v-if="validateResult.integrityWarnings.length > 0"
            type="error"
            show-icon
            :closable="false"
            class="integrity-alert"
            style="margin-top: 16px;"
          >
            <div v-for="(w, i) in validateResult.integrityWarnings" :key="i">{{ w }}</div>
          </el-alert>

          <el-alert
            v-if="validateResult.diff.warnings.length > 0"
            type="warning"
            show-icon
            :closable="false"
            class="warning-alert"
            style="margin-top: 16px;"
          >
            <div v-for="(w, i) in validateResult.diff.warnings.slice(0, 5)" :key="i">{{ w }}</div>
          </el-alert>

          <div class="strategy-selector" style="margin-top: 20px;">
            <div class="selector-label">请选择恢复策略：</div>
            <el-radio-group v-model="selectedStrategy" size="large">
              <el-radio-button value="merge">
                <div class="radio-content">
                  <el-icon color="#67c23a"><Plus /></el-icon>
                  <span>合并模式</span>
                </div>
                <div class="radio-desc">保留现有数据，冲突项以备份为准</div>
              </el-radio-button>
              <el-radio-button value="overwrite">
                <div class="radio-content">
                  <el-icon color="#e6a23c"><RefreshLeft /></el-icon>
                  <span>覆盖模式</span>
                </div>
                <div class="radio-desc">删除现有数据，完全替换为备份</div>
              </el-radio-button>
            </el-radio-group>
          </div>

          <div class="diff-table-section" style="margin-top: 20px;">
            <div class="section-title">
              <el-icon :size="16" color="#409eff"><DataLine /></el-icon>
              <span>差异预览</span>
              <el-tag size="small" type="info" effect="plain">
                {{ totalChanges }} 处变更
              </el-tag>
            </div>
            <el-table :data="diffTableData" border stripe size="default" style="margin-top: 12px;">
              <el-table-column label="数据类型" prop="label" min-width="110">
                <template #default="{ row }">
                  <div class="entity-cell">
                    <el-tag size="small" type="info" effect="plain" style="margin-right: 8px;">
                      {{ row.icon }}
                    </el-tag>
                    <span>{{ row.label }}</span>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="备份中" prop="total" width="80" align="center" />
              <el-table-column label="新增" width="80" align="center">
                <template #default="{ row }">
                  <span v-if="row.diff.toAdd > 0" class="num-add">+{{ row.diff.toAdd }}</span>
                  <span v-else class="num-zero">0</span>
                </template>
              </el-table-column>
              <el-table-column label="更新" width="80" align="center">
                <template #default="{ row }">
                  <span v-if="row.diff.toUpdate > 0" class="num-update">~{{ row.diff.toUpdate }}</span>
                  <span v-else class="num-zero">0</span>
                </template>
              </el-table-column>
              <el-table-column label="删除" width="80" align="center">
                <template #default="{ row }">
                  <span v-if="row.diff.toDelete > 0" class="num-delete">-{{ row.diff.toDelete }}</span>
                  <span v-else class="num-zero">0</span>
                </template>
              </el-table-column>
              <el-table-column label="冲突" min-width="120">
                <template #default="{ row }">
                  <el-popover
                    v-if="row.diff.conflicts && row.diff.conflicts.length > 0"
                    placement="top"
                    :width="320"
                    trigger="hover"
                  >
                    <template #reference>
                      <el-tag type="warning" size="small" effect="light" style="cursor: pointer;">
                        {{ row.diff.conflicts.length }} 处冲突
                      </el-tag>
                    </template>
                    <div class="conflict-list">
                      <div v-for="(c, i) in row.diff.conflicts.slice(0, 10)" :key="i" class="conflict-item">
                        {{ c }}
                      </div>
                      <div v-if="row.diff.conflicts.length > 10" class="conflict-more">
                        ... 还有 {{ row.diff.conflicts.length - 10 }} 条未显示
                      </div>
                    </div>
                  </el-popover>
                  <span v-else class="num-zero">无</span>
                </template>
              </el-table-column>
            </el-table>
          </div>

          <div v-if="validateResult.integrity === 'tampered'" class="tampered-confirm">
            <el-checkbox v-model="allowTampered">
              <span style="color: #f56c6c;">我已了解风险，确认继续导入该文件（不推荐）</span>
            </el-checkbox>
          </div>

          <div class="action-buttons" style="margin-top: 24px;">
            <el-button size="large" :icon="ArrowLeft" @click="resetImport">
              重新选择文件
            </el-button>
            <el-button
              type="primary"
              size="large"
              :icon="Check"
              :loading="importing"
              :disabled="validateResult.integrity === 'tampered' && !allowTampered"
              @click="handleConfirmImport"
            >
              {{ importing ? '正在恢复数据（请勿刷新页面）...' : '确认恢复' }}
            </el-button>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue'
import axios from 'axios'
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus'
import {
  Download,
  UploadFilled,
  Promotion,
  CircleCheckFilled,
  Plus,
  RefreshLeft,
  DataLine,
  ArrowLeft,
  Check
} from '@element-plus/icons-vue'
import type {
  RestoreStrategy,
  BackupValidateResponse,
  BackupDiff,
  BackupSchemaInfo,
  BackupEntityLabel
} from '../types'

const emit = defineEmits<{
  (e: 'data-restored'): void
}>()

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''
const token = () => localStorage.getItem('accessToken') || ''

const activeTab = ref<'export' | 'import'>('export')
const exporting = ref(false)
const importing = ref(false)
const schemaInfo = ref<BackupSchemaInfo | null>(null)

const selectedFile = ref<any>(null)
const uploadError = ref<string>('')
const validateResult = ref<BackupValidateResponse | null>(null)
const selectedStrategy = ref<RestoreStrategy>('merge')
const allowTampered = ref(false)
const cachedBackupData = ref<any>(null)

const ENTITY_LABELS: BackupEntityLabel[] = [
  { key: 'categories', label: '资产类别', icon: '📂' },
  { key: 'tags', label: '标签', icon: '🏷️' },
  { key: 'assetRecords', label: '资产记录', icon: '📊' },
  { key: 'assetItems', label: '分类金额', icon: '💵' },
  { key: 'assetRecordTags', label: '记录标签关联', icon: '🔗' },
  { key: 'liabilityRecords', label: '负债记录', icon: '💳' },
  { key: 'goals', label: '目标', icon: '🎯' },
  { key: 'targetAllocation', label: '目标配置', icon: '⚙️' },
  { key: 'cashFlows', label: '资金流', icon: '💰' }
]

const integrityTagType = computed(() => {
  if (!validateResult.value) return 'info'
  if (validateResult.value.integrity === 'valid') return 'success'
  return 'danger'
})

const integrityTagText = computed(() => {
  if (!validateResult.value) return ''
  if (validateResult.value.integrity === 'valid') return '文件完整'
  return '校验不匹配'
})

const totalBackupCount = computed(() => {
  if (!validateResult.value) return 0
  const s = validateResult.value.backup.stats
  return Object.values(s).reduce((a, b) => a + b, 0)
})

const totalChanges = computed(() => {
  if (!validateResult.value) return 0
  const d = validateResult.value.diff
  let total = 0
  for (const key of ENTITY_LABELS.map(e => e.key)) {
    const item = (d as any)[key]
    if (item) {
      total += item.toAdd + item.toUpdate + item.toDelete
    }
  }
  return total
})

const diffTableData = computed(() => {
  if (!validateResult.value) return []
  const d = validateResult.value.diff
  return ENTITY_LABELS.map(label => ({
    key: label.key,
    label: label.label,
    icon: label.icon,
    total: ((d as any)[label.key]?.total ?? 0),
    diff: (d as any)[label.key] ?? { total: 0, toAdd: 0, toUpdate: 0, toDelete: 0, conflicts: [] }
  }))
})

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

async function loadSchema() {
  try {
    const res = await axios.get(`${API_BASE_URL}/api/backup/schema`, {
      headers: { Authorization: `Bearer ${token()}` }
    })
    schemaInfo.value = res.data
  } catch (e) {
    console.error('Load schema error:', e)
  }
}

async function handleExport() {
  try {
    exporting.value = true
    const res = await axios.get(`${API_BASE_URL}/api/backup/export`, {
      headers: { Authorization: `Bearer ${token()}` },
      responseType: 'blob'
    })

    const disposition = res.headers['content-disposition']
    let filename = `asset-backup-${Date.now()}.json`
    if (disposition) {
      const match = disposition.match(/filename="?([^"]+)"?/)
      if (match) filename = match[1]
    }

    const blob = new Blob([res.data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    ElMessage.success(`备份文件已导出：${filename}`)
  } catch (e: any) {
    console.error('Export error:', e)
    ElMessage.error(e?.response?.data?.error || '导出失败，请稍后重试')
  } finally {
    exporting.value = false
  }
}

async function handleFileChange(file: any) {
  uploadError.value = ''
  validateResult.value = null
  cachedBackupData.value = null

  const maxSize = (schemaInfo.value?.maxSizeMB || 50) * 1024 * 1024
  if (file.size > maxSize) {
    uploadError.value = `文件过大（${(file.size / 1024 / 1024).toFixed(2)}MB），最大允许 ${schemaInfo.value?.maxSizeMB || 50}MB`
    return
  }
  if (!file.name.toLowerCase().endsWith('.json')) {
    uploadError.value = '仅支持 .json 格式的备份文件'
    return
  }

  try {
    const raw = await file.raw.text()
    let data
    try {
      data = JSON.parse(raw)
    } catch {
      uploadError.value = '文件不是有效的 JSON 格式，可能已损坏'
      return
    }
    cachedBackupData.value = data
    await runValidate()
  } catch (e: any) {
    uploadError.value = e?.message || '读取文件失败'
  }
}

function handleFileExceed() {
  ElMessage.warning('每次只能上传一个备份文件')
}

async function runValidate() {
  try {
    const res = await axios.post(
      `${API_BASE_URL}/api/backup/validate?strategy=${selectedStrategy.value}`,
      cachedBackupData.value,
      {
        headers: { Authorization: `Bearer ${token()}` }
      }
    )
    validateResult.value = res.data
  } catch (e: any) {
    const err = e?.response?.data
    if (err?.versionError || err?.backupVersion) {
      ElMessageBox.alert(
        `${err.versionError || '版本不兼容'}\n备份版本: v${err.backupVersion || '未知'}\n当前版本: v${err.currentVersion || schemaInfo.value?.version || '未知'}`,
        '版本不兼容',
        { type: 'error', confirmButtonText: '知道了' }
      )
    } else if (err?.tampered) {
      ElMessageBox.alert(
        '备份文件校验和不匹配，文件可能被篡改或损坏。\n您仍可在勾选风险确认后强制导入，但不推荐这样做。',
        '文件完整性警告',
        { type: 'warning', confirmButtonText: '我知道了' }
      )
      try {
        const res2 = await axios.post(
          `${API_BASE_URL}/api/backup/validate?strategy=${selectedStrategy.value}`,
          cachedBackupData.value,
          {
            headers: { Authorization: `Bearer ${token()}` },
            validateStatus: (s: number) => s === 200 || s === 400
          }
        )
        if (res2.data?.diff) {
          validateResult.value = res2.data
        } else {
          uploadError.value = err?.error || '文件校验失败'
        }
      } catch {
        uploadError.value = err?.error || '文件校验失败'
      }
    } else {
      uploadError.value = err?.error || '文件校验失败'
    }
  }
}

watch(selectedStrategy, () => {
  if (cachedBackupData.value && validateResult.value) {
    runValidate()
  }
})

async function handleConfirmImport() {
  const strategyLabel = selectedStrategy.value === 'overwrite' ? '覆盖模式' : '合并模式'
  const overwriteWarn = selectedStrategy.value === 'overwrite'
    ? '⚠️ 此模式将删除您当前所有数据后再导入，不可恢复！'
    : '此模式将保留现有数据，冲突项以备份覆盖。'

  try {
    await ElMessageBox.confirm(
      `确认使用【${strategyLabel}】恢复数据吗？\n${overwriteWarn}\n预计共 ${totalChanges.value} 处变更。\n建议先在"导出备份"页签备份当前数据。`,
      '最终确认',
      {
        confirmButtonText: '确认恢复',
        cancelButtonText: '取消',
        type: selectedStrategy.value === 'overwrite' ? 'error' : 'warning',
        dangerouslyUseHTMLString: false
      }
    )
  } catch {
    return
  }

  try {
    importing.value = true
    const res = await axios.post(
      `${API_BASE_URL}/api/backup/import`,
      {
        strategy: selectedStrategy.value,
        allowTampered: allowTampered.value,
        backup: cachedBackupData.value
      },
      {
        headers: { Authorization: `Bearer ${token()}` },
        timeout: 120000
      }
    )
    const data = res.data as any
    ElNotification({
      title: '恢复成功',
      message: `${data.message}，共处理 ${totalBackupCount.value} 条数据`,
      type: 'success',
      duration: 5000
    })
    emit('data-restored')
    resetImport()
  } catch (e: any) {
    const err = e?.response?.data
    if (err?.rollback) {
      ElNotification({
        title: '恢复失败（已自动回滚）',
        message: err.error || '未知错误',
        type: 'error',
        duration: 8000
      })
    } else {
      ElMessage.error(err?.error || '恢复失败，请稍后重试')
    }
    console.error('Import error:', e)
  } finally {
    importing.value = false
  }
}

function resetImport() {
  selectedFile.value = null
  uploadError.value = ''
  validateResult.value = null
  cachedBackupData.value = null
  allowTampered.value = false
}

onMounted(() => {
  loadSchema()
})
</script>

<style scoped>
.backup-restore-card {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  padding: 24px;
  margin-bottom: 24px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid #ebeef5;
}

.card-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 18px;
  font-weight: 600;
  color: #303133;
}

.info-alert {
  margin-top: 0;
}

.schema-info {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-top: 24px;
  padding: 16px;
  background: #f5f7fa;
  border-radius: 8px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-item .label {
  font-size: 12px;
  color: #909399;
}

.info-item .value {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
}

.upload-area {
  width: 100%;
}

.upload-icon {
  color: #c0c4cc;
  margin-bottom: 8px;
}

.upload-tip {
  color: #909399;
  font-size: 12px;
  margin-top: 8px;
}

.upload-error {
  margin-top: 16px;
}

.backup-info-card {
  border: 1px solid #e1f3d8;
}

.backup-info-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 15px;
}

.backup-info-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px 24px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px dashed #ebeef5;
}

.info-row:last-child,
.info-row:nth-last-child(2) {
  border-bottom: none;
}

.info-row .label {
  color: #909399;
  font-size: 13px;
}

.info-row .value {
  color: #303133;
  font-weight: 500;
  font-size: 13px;
}

.integrity-alert,
.warning-alert {
  font-size: 13px;
}

.strategy-selector {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.selector-label {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
  margin-bottom: 4px;
}

.radio-content {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
  font-size: 14px;
}

.radio-desc {
  font-size: 11px;
  opacity: 0.75;
  margin-top: 2px;
  padding-left: 24px;
  line-height: 1.4;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 8px;
}

.entity-cell {
  display: flex;
  align-items: center;
}

.num-add {
  color: #67c23a;
  font-weight: 600;
}

.num-update {
  color: #e6a23c;
  font-weight: 600;
}

.num-delete {
  color: #f56c6c;
  font-weight: 600;
}

.num-zero {
  color: #c0c4cc;
}

.conflict-list {
  font-size: 12px;
  line-height: 1.7;
}

.conflict-item {
  padding: 4px 0;
  border-bottom: 1px dashed #ebeef5;
  color: #606266;
}

.conflict-item:last-child {
  border-bottom: none;
}

.conflict-more {
  color: #909399;
  padding-top: 4px;
  font-style: italic;
}

.tampered-confirm {
  margin-top: 20px;
  padding: 14px 16px;
  background: #fef0f0;
  border: 1px solid #fde2e2;
  border-radius: 6px;
}

.action-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

:deep(.el-radio-button__inner) {
  padding: 14px 20px;
  height: auto;
  line-height: 1.4;
  text-align: left;
}

@media (max-width: 768px) {
  .schema-info,
  .backup-info-grid {
    grid-template-columns: 1fr;
  }

  .action-buttons {
    flex-direction: column-reverse;
  }

  .action-buttons .el-button {
    width: 100%;
  }
}
</style>
