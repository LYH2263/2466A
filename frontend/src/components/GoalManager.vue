<template>
  <div class="goal-manager">
    <el-card shadow="hover">
      <template #header>
        <div class="manager-header">
          <span class="manager-title">
            <el-icon><Aim /></el-icon>
            目标管理
          </span>
          <el-button type="primary" size="small" :icon="Plus" @click="handleAdd">
            新增目标
          </el-button>
        </div>
      </template>

      <div v-if="goals.length === 0" class="empty-goals">
        <el-empty description="暂无目标，点击上方按钮设定您的第一个资产目标" :image-size="80" />
      </div>

      <div v-else class="goals-list">
        <div
          v-for="goal in goals"
          :key="goal.id"
          class="goal-item"
          :class="{
            'goal-completed': goal.isCompleted,
            'goal-expired': goal.isExpired && !goal.isCompleted,
            'goal-exceeded': goal.isExceeded
          }"
        >
          <div class="goal-item-header">
            <div class="goal-item-info">
              <span class="goal-name">{{ goal.name }}</span>
              <el-tag
                v-if="goal.isCompleted"
                type="success"
                size="small"
                effect="dark"
              >
                已完成
              </el-tag>
              <el-tag
                v-else-if="goal.isExpired"
                type="danger"
                size="small"
                effect="dark"
              >
                已过期
              </el-tag>
              <el-tag
                v-else-if="goal.isExceeded"
                type="success"
                size="small"
              >
                已超额
              </el-tag>
              <el-tag size="small" :type="goal.scope === 'total' ? '' : 'warning'">
                {{ goal.scope === 'total' ? '总资产' : '类别' }}
              </el-tag>
            </div>
            <div class="goal-item-actions">
              <el-button size="small" :icon="Edit" @click="handleEdit(goal)" text />
              <el-button size="small" :icon="Delete" type="danger" @click="handleDelete(goal)" text />
            </div>
          </div>
        </div>
      </div>
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      :title="isEditing ? '编辑目标' : '新增目标'"
      width="500px"
      :close-on-click-modal="false"
    >
      <el-form
        ref="formRef"
        :model="formData"
        :rules="formRules"
        label-width="100px"
        label-position="top"
      >
        <el-form-item label="目标名称" prop="name">
          <el-input v-model="formData.name" placeholder="例如：年度存款目标" maxlength="50" show-word-limit />
        </el-form-item>

        <el-form-item label="目标范围" prop="scope">
          <el-radio-group v-model="formData.scope" @change="handleScopeChange">
            <el-radio value="total">总资产</el-radio>
            <el-radio value="category">单类别</el-radio>
          </el-radio-group>
        </el-form-item>

        <el-form-item v-if="formData.scope === 'category'" label="选择类别" prop="categoryId">
          <el-select v-model="formData.categoryId" placeholder="请选择类别" style="width: 100%">
            <el-option
              v-for="cat in activeCategories"
              :key="cat.id"
              :label="cat.name"
              :value="cat.id"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="目标金额" prop="targetAmount">
          <el-input-number
            v-model="formData.targetAmount"
            :min="0.01"
            :precision="2"
            :step="10000"
            placeholder="请输入目标金额"
            style="width: 100%"
          />
        </el-form-item>

        <el-form-item label="目标日期" prop="targetDate">
          <el-date-picker
            v-model="formData.targetDate"
            type="date"
            placeholder="选择目标达成日期"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"
            style="width: 100%"
            :disabled-date="disablePastDates"
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit" :loading="submitting">
          {{ isEditing ? '保存' : '创建' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Aim, Plus, Edit, Delete } from '@element-plus/icons-vue'
import type { FormInstance, FormRules } from 'element-plus'
import type { GoalProgress, GoalFormData, Category } from '../types'

interface Props {
  goals: GoalProgress[]
  activeCategories: Category[]
  addGoal: (data: GoalFormData) => Promise<{ success: boolean; error?: string }>
  updateGoal: (id: string, data: Partial<GoalFormData> & { isCompleted?: boolean }) => Promise<{ success: boolean; error?: string }>
  deleteGoal: (id: string) => Promise<{ success: boolean; error?: string }>
}

const props = defineProps<Props>()

const dialogVisible = ref(false)
const isEditing = ref(false)
const editingId = ref<string | null>(null)
const submitting = ref(false)
const formRef = ref<FormInstance>()

const defaultFormData = (): GoalFormData => ({
  name: '',
  targetAmount: 100000,
  targetDate: '',
  scope: 'total',
  categoryId: null
})

const formData = reactive<GoalFormData>(defaultFormData())

const formRules: FormRules = {
  name: [
    { required: true, message: '请输入目标名称', trigger: 'blur' },
    { max: 50, message: '目标名称最多50字', trigger: 'blur' }
  ],
  scope: [
    { required: true, message: '请选择目标范围', trigger: 'change' }
  ],
  categoryId: [
    {
      validator: (_rule: any, value: any, callback: any) => {
        if (formData.scope === 'category' && !value) {
          callback(new Error('类别目标必须选择一个类别'))
        } else {
          callback()
        }
      },
      trigger: 'change'
    }
  ],
  targetAmount: [
    { required: true, message: '请输入目标金额', trigger: 'blur' },
    { type: 'number', min: 0.01, message: '目标金额必须大于0', trigger: 'blur' }
  ],
  targetDate: [
    { required: true, message: '请选择目标日期', trigger: 'change' }
  ]
}

const disablePastDates = (date: Date) => {
  return date.getTime() < Date.now() - 24 * 60 * 60 * 1000
}

const handleScopeChange = () => {
  if (formData.scope === 'total') {
    formData.categoryId = null
  }
}

const handleAdd = () => {
  isEditing.value = false
  editingId.value = null
  Object.assign(formData, defaultFormData())
  dialogVisible.value = true
}

const handleEdit = (goal: GoalProgress) => {
  isEditing.value = true
  editingId.value = goal.id
  Object.assign(formData, {
    name: goal.name,
    targetAmount: goal.targetAmount,
    targetDate: goal.targetDate,
    scope: goal.scope,
    categoryId: goal.categoryId
  })
  dialogVisible.value = true
}

const handleDelete = async (goal: GoalProgress) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除目标「${goal.name}」吗？`,
      '确认删除',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
    )
    const result = await props.deleteGoal(goal.id)
    if (result.success) {
      ElMessage.success('目标已删除')
    } else {
      ElMessage.error(result.error || '删除失败')
    }
  } catch {
    // cancelled
  }
}

const handleSubmit = async () => {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    if (isEditing.value && editingId.value) {
      const result = await props.updateGoal(editingId.value, { ...formData })
      if (result.success) {
        ElMessage.success('目标已更新')
        dialogVisible.value = false
      } else {
        ElMessage.error(result.error || '更新失败')
      }
    } else {
      const result = await props.addGoal({ ...formData })
      if (result.success) {
        ElMessage.success('目标已创建')
        dialogVisible.value = false
      } else {
        ElMessage.error(result.error || '创建失败')
      }
    }
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.goal-manager {
  margin-bottom: 20px;
}

.manager-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.manager-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
}

.empty-goals {
  padding: 20px 0;
}

.goals-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.goal-item {
  padding: 12px 16px;
  border-radius: 8px;
  border: 1px solid #ebeef5;
  transition: all 0.2s;
}

.goal-item:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.goal-item.goal-completed {
  background: #f0f9eb;
  border-color: #e1f3d8;
}

.goal-item.goal-expired {
  background: #fef0f0;
  border-color: #fde2e2;
}

.goal-item.goal-exceeded {
  background: #f0f9eb;
  border-color: #e1f3d8;
}

.goal-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.goal-item-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.goal-name {
  font-weight: 500;
  font-size: 14px;
  color: #303133;
}

.goal-item-actions {
  display: flex;
  gap: 4px;
}
</style>
