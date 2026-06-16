<template>
  <el-card class="cashflow-manager" shadow="hover">
    <template #header>
      <div class="card-header">
        <span class="header-title">
          <el-icon class="header-icon"><Wallet /></el-icon>
          资金流记录
        </span>
        <div class="header-summary">
          <el-tag type="success" size="small">
            存入: {{ formatMoney(summary.totalDeposit) }}
          </el-tag>
          <el-tag type="danger" size="small" style="margin-left: 8px;">
            取出: {{ formatMoney(Math.abs(summary.totalWithdraw)) }}
          </el-tag>
          <el-tag :type="summary.netCashFlow >= 0 ? 'success' : 'danger'" size="small" style="margin-left: 8px;">
            净: {{ formatSignedMoney(summary.netCashFlow) }}
          </el-tag>
        </div>
      </div>
    </template>

    <div class="content">
      <el-form
        ref="formRef"
        :model="formData"
        :rules="formRules"
        label-width="80px"
        inline
        class="add-form"
      >
        <el-form-item label="日期" prop="date">
          <el-date-picker
            v-model="formData.date"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="选择日期"
          />
        </el-form-item>
        <el-form-item label="类型" prop="type">
          <el-select v-model="formData.type" placeholder="资金类型" style="width: 140px;">
            <el-option
              v-for="(label, key) in CASH_FLOW_TYPE_LABELS"
              :key="key"
              :label="label"
              :value="key"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="金额" prop="amount">
          <el-input-number
            v-model="formData.amount"
            :precision="2"
            :step="1000"
            :min="-99999999.99"
            :max="99999999.99"
            placeholder="正数存入，负数取出"
            style="width: 200px;"
          />
        </el-form-item>
        <el-form-item label="备注" prop="note">
          <el-input
            v-model="formData.note"
            placeholder="可选备注"
            maxlength="200"
            show-word-limit
            style="width: 200px;"
          />
        </el-form-item>
        <el-form-item>
          <el-button
            v-if="formMode === 'create'"
            type="primary"
            :icon="Plus"
            :loading="submitting"
            @click="handleSubmit"
          >
            添加记录
          </el-button>
          <template v-else>
            <el-button
              type="primary"
              :icon="Check"
              :loading="submitting"
              @click="handleSubmit"
            >
              保存
            </el-button>
            <el-button :icon="Close" @click="handleCancel">取消</el-button>
          </template>
        </el-form-item>
      </el-form>

      <el-table
        v-loading="loading"
        :data="displayCashFlows"
        stripe
        style="width: 100%; margin-top: 16px;"
      >
        <el-table-column label="日期" prop="date" width="120" sortable />
        <el-table-column label="类型" width="100">
          <template #default="{ row }">
            <el-tag
              size="small"
              :style="{ borderColor: CASH_FLOW_TYPE_COLORS[row.type], color: CASH_FLOW_TYPE_COLORS[row.type] }"
            >
              {{ CASH_FLOW_TYPE_LABELS[row.type] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="金额" width="160" align="right" sortable>
          <template #default="{ row }">
            <span :class="row.amount > 0 ? 'up' : 'down'">
              {{ formatSignedMoney(row.amount) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="备注" prop="note" show-overflow-tooltip />
        <el-table-column label="操作" width="160" align="center" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" :icon="Edit" @click="handleEdit(row)">
              编辑
            </el-button>
            <el-button type="danger" link size="small" :icon="Delete" @click="handleDelete(row)">
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { Wallet, Plus, Check, Close, Edit, Delete } from '@element-plus/icons-vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useCashFlows } from '../composables/useCashFlows'
import type { CashFlow, CashFlowFormData } from '../types'
import { CASH_FLOW_TYPE_LABELS, CASH_FLOW_TYPE_COLORS } from '../types'

const emit = defineEmits(['cashflows-updated'])

const {
  cashFlows,
  summary,
  loading,
  fetchCashFlows,
  addCashFlow,
  updateCashFlow,
  deleteCashFlow,
  createEmptyFormData
} = useCashFlows()

const formRef = ref<FormInstance>()
const submitting = ref(false)
const formMode = ref<'create' | 'edit'>('create')
const editingId = ref<string | null>(null)

const formData = reactive<CashFlowFormData>(createEmptyFormData())

const formRules: FormRules = {
  date: [{ required: true, message: '请选择日期', trigger: 'change' }],
  type: [{ required: true, message: '请选择类型', trigger: 'change' }],
  amount: [
    { required: true, message: '请输入金额', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        if (value === 0) {
          callback(new Error('金额不能为0'))
        } else {
          callback()
        }
      },
      trigger: 'blur'
    }
  ]
}

const displayCashFlows = computed(() => {
  return [...cashFlows.value].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
})

const formatMoney = (value: number): string => {
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', minimumFractionDigits: 2 }).format(value)
}

const formatSignedMoney = (value: number): string => {
  const sign = value > 0 ? '+' : ''
  return sign + formatMoney(value)
}

const resetForm = () => {
  const empty = createEmptyFormData()
  Object.assign(formData, empty)
  formMode.value = 'create'
  editingId.value = null
  formRef.value?.resetFields()
}

const handleSubmit = async () => {
  if (!formRef.value) return

  try {
    await formRef.value.validate()
  } catch {
    return
  }

  submitting.value = true
  try {
    let result
    if (formMode.value === 'create') {
      result = await addCashFlow(formData)
    } else if (editingId.value) {
      result = await updateCashFlow(editingId.value, formData)
    }

    if (result?.success) {
      ElMessage.success(formMode.value === 'create' ? '添加成功' : '更新成功')
      resetForm()
      emit('cashflows-updated')
    } else {
      ElMessage.error(result?.error || '操作失败')
    }
  } finally {
    submitting.value = false
  }
}

const handleEdit = (row: CashFlow) => {
  formMode.value = 'edit'
  editingId.value = row.id
  formData.date = row.date
  formData.amount = row.amount
  formData.type = row.type
  formData.note = row.note || ''
  formData.assetRecordId = row.assetRecordId
}

const handleCancel = () => {
  resetForm()
}

const handleDelete = async (row: CashFlow) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除这条${CASH_FLOW_TYPE_LABELS[row.type]}记录吗？`,
      '确认删除',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
    )
    const result = await deleteCashFlow(row.id)
    if (result.success) {
      ElMessage.success('删除成功')
      emit('cashflows-updated')
    } else {
      ElMessage.error(result.error || '删除失败')
    }
  } catch {
  }
}

const loadData = async () => {
  try {
    await fetchCashFlows()
  } catch (err: any) {
    ElMessage.error(err.message || '加载资金流记录失败')
  }
}

onMounted(() => {
  loadData()
})

defineExpose({ loadData })
</script>

<style scoped>
.cashflow-manager {
  margin-bottom: 24px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.header-icon {
  color: #409eff;
  font-size: 18px;
}

.header-summary {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
}

.add-form {
  padding: 16px;
  background: #fafafa;
  border-radius: 8px;
  border: 1px solid #ebeef5;
}

.up {
  color: #67c23a;
  font-weight: 600;
}

.down {
  color: #f56c6c;
  font-weight: 600;
}

@media (max-width: 768px) {
  .card-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .add-form {
    padding: 12px;
  }

  .add-form :deep(.el-form-item) {
    margin-right: 0;
    width: 100%;
  }

  .add-form :deep(.el-form-item__content) {
    width: 100%;
  }
}
</style>
