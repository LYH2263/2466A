<template>
  <div class="asset-form">
    <el-card class="form-card">
      <template #header>
        <div class="card-header">
          <span>{{ mode === 'create' ? '资产录入' : '编辑资产记录' }}</span>
          <div v-if="mode === 'edit'" class="edit-meta">
            <el-tag v-if="editCount > 0" type="warning" size="small">
              已编辑 {{ editCount }} 次
            </el-tag>
            <el-button size="small" :icon="Close" @click="handleCancel">取消编辑</el-button>
          </div>
        </div>
      </template>

      <el-form ref="formRef" :model="formData" label-position="top" @submit.prevent="handleSubmit">
        <el-row :gutter="20">
          <el-col :xs="24" :sm="12">
            <el-form-item label="盘点日期" required>
              <el-date-picker
                v-model="formData.date"
                type="date"
                placeholder="选择日期"
                format="YYYY-MM-DD"
                value-format="YYYY-MM-DD"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="20">
          <el-col :xs="24" :sm="8">
            <el-form-item label="活钱（元）">
              <el-input-number
                v-model="formData.cash"
                :precision="2"
                :min="0"
                :step="1000"
                placeholder="0.00"
                style="width: 100%"
                controls-position="right"
              />
            </el-form-item>
          </el-col>
          
          <el-col :xs="24" :sm="8">
            <el-form-item label="长期投资（元）">
              <el-input-number
                v-model="formData.longTermInvest"
                :precision="2"
                :min="0"
                :step="1000"
                placeholder="0.00"
                style="width: 100%"
                controls-position="right"
              />
            </el-form-item>
          </el-col>
          
          <el-col :xs="24" :sm="8">
            <el-form-item label="稳定债券（元）">
              <el-input-number
                v-model="formData.stableBond"
                :precision="2"
                :min="0"
                :step="1000"
                placeholder="0.00"
                style="width: 100%"
                controls-position="right"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="备注">
          <el-input
            v-model="formData.note"
            type="textarea"
            :rows="2"
            placeholder="可选，最多100字"
            maxlength="100"
            show-word-limit
          />
        </el-form-item>

        <el-form-item>
          <el-button type="primary" native-type="submit" :icon="mode === 'create' ? Plus : Edit">
            {{ mode === 'create' ? '新增记录' : '保存修改' }}
          </el-button>
          <el-button v-if="mode === 'create'" :icon="DataLine" @click="$emit('fill-demo')">
            填充示例数据
          </el-button>
          <el-button v-if="mode === 'edit'" :icon="Close" @click="handleCancel">
            取消
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { Plus, DataLine, Edit, Close } from '@element-plus/icons-vue'
import type { AssetFormData, AssetRecord } from '../types'

interface Props {
  mode?: 'create' | 'edit'
  editingRecord?: AssetRecord | null
}

const props = withDefaults(defineProps<Props>(), {
  mode: 'create',
  editingRecord: null
})

const emit = defineEmits<{
  submit: [data: AssetFormData]
  'fill-demo': []
  cancel: []
}>()

const formRef = ref()

const formData = reactive<AssetFormData>({
  date: new Date().toISOString().split('T')[0],
  cash: null,
  longTermInvest: null,
  stableBond: null,
  note: ''
})

const editCount = ref(0)

// Prefill form when editingRecord changes
watch(
  () => props.editingRecord,
  (record) => {
    if (record && props.mode === 'edit') {
      formData.date = record.date
      formData.cash = record.cash
      formData.longTermInvest = record.longTermInvest
      formData.stableBond = record.stableBond
      formData.note = record.note || ''
      editCount.value = record.editCount || 0
    }
  },
  { immediate: true }
)

const resetForm = () => {
  formData.date = new Date().toISOString().split('T')[0]
  formData.cash = null
  formData.longTermInvest = null
  formData.stableBond = null
  formData.note = ''
  editCount.value = 0
}

const handleSubmit = () => {
  emit('submit', { ...formData })
  if (props.mode === 'create') {
    formData.cash = null
    formData.longTermInvest = null
    formData.stableBond = null
    formData.note = ''
  }
}

const handleCancel = () => {
  resetForm()
  emit('cancel')
}
</script>

<style scoped>
.asset-form {
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 16px;
  font-weight: 600;
}

.edit-meta {
  display: flex;
  align-items: center;
  gap: 12px;
}
</style>
