<template>
  <el-card class="liability-form-card" shadow="hover">
    <template #header>
      <div class="card-header">
        <el-icon class="header-icon"><CreditCard /></el-icon>
        <span>{{ mode === 'create' ? '新增负债' : '编辑负债' }}</span>
      </div>
    </template>

    <el-form
      ref="formRef"
      :model="formData"
      :rules="rules"
      label-width="80px"
      label-position="right"
    >
      <el-row :gutter="20">
        <el-col :xs="24" :sm="12" :md="6">
          <el-form-item label="名称" prop="name">
            <el-input
              v-model="formData.name"
              placeholder="如：房贷、消费贷"
              maxlength="100"
              show-word-limit
            />
          </el-form-item>
        </el-col>

        <el-col :xs="24" :sm="12" :md="6">
          <el-form-item label="金额" prop="amount">
            <el-input-number
              v-model="formData.amount"
              :min="0"
              :precision="2"
              :step="1000"
              :step-strictly="false"
              style="width: 100%"
              controls-position="right"
              placeholder="剩余金额"
            />
          </el-form-item>
        </el-col>

        <el-col :xs="24" :sm="12" :md="6">
          <el-form-item label="日期" prop="date">
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

        <el-col :xs="24" :sm="12" :md="6">
          <el-form-item label="备注" prop="note">
            <el-input
              v-model="formData.note"
              placeholder="可选备注"
              maxlength="200"
              show-word-limit
            />
          </el-form-item>
        </el-col>
      </el-row>

      <el-form-item>
        <el-button
          type="primary"
          :icon="Check"
          @click="handleSubmit"
          :loading="submitting"
        >
          {{ mode === 'create' ? '添加' : '保存' }}
        </el-button>
        <el-button
          v-if="mode === 'edit'"
          :icon="Close"
          @click="handleCancel"
        >
          取消
        </el-button>
        <el-button
          v-if="!hasRecords && mode === 'create'"
          :icon="MagicStick"
          @click="$emit('fill-demo')"
          type="success"
          plain
        >
          填充示例数据
        </el-button>
      </el-form-item>
    </el-form>
  </el-card>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { CreditCard, Check, Close, MagicStick } from '@element-plus/icons-vue'
import type { LiabilityFormData, LiabilityRecord } from '../types'

interface Props {
  mode: 'create' | 'edit'
  editingRecord: LiabilityRecord | null
  createEmptyFormData: () => LiabilityFormData
  recordToFormData: (record: LiabilityRecord) => LiabilityFormData
  hasRecords: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  submit: [formData: LiabilityFormData]
  cancel: []
  'fill-demo': []
}>()

const formRef = ref<FormInstance>()
const submitting = ref(false)
const formData = ref<LiabilityFormData>(props.createEmptyFormData())

const rules: FormRules = {
  name: [
    { required: true, message: '请输入名称', trigger: 'blur' },
    { min: 1, max: 100, message: '名称在1-100字符之间', trigger: 'blur' }
  ],
  amount: [
    { required: true, message: '请输入金额', trigger: 'blur' },
    { type: 'number', min: 0, message: '金额不能为负数', trigger: 'blur' }
  ],
  date: [
    { required: true, message: '请选择日期', trigger: 'change' }
  ]
}

watch(
  () => props.editingRecord,
  (record) => {
    if (props.mode === 'edit' && record) {
      formData.value = props.recordToFormData(record)
    } else {
      formData.value = props.createEmptyFormData()
    }
  },
  { immediate: true }
)

watch(
  () => props.mode,
  () => {
    if (props.mode === 'create') {
      formData.value = props.createEmptyFormData()
    }
  }
)

const handleSubmit = async () => {
  if (!formRef.value) return

  try {
    await formRef.value.validate()
    submitting.value = true
    emit('submit', { ...formData.value })
  } catch (err) {
    ElMessage.warning('请检查表单填写是否正确')
  } finally {
    submitting.value = false
  }
}

const handleCancel = () => {
  formData.value = props.createEmptyFormData()
  formRef.value?.resetFields()
  emit('cancel')
}
</script>

<style scoped>
.liability-form-card {
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
}

.header-icon {
  font-size: 20px;
  color: #f56c6c;
}
</style>
