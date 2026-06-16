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
          <el-col
            v-for="(category, index) in activeCategories"
            :key="category.id"
            :xs="24"
            :sm="8"
            :md="Math.max(6, Math.floor(24 / Math.min(activeCategories.length, 4)))"
          >
            <el-form-item :label="`${category.name}（元）`" required>
              <div class="category-input-wrapper">
                <div class="color-dot" :style="{ backgroundColor: category.color }" />
                <el-input-number
                  v-model="formData.categoryAmounts[index].amount"
                  :precision="2"
                  :min="0"
                  :step="1000"
                  :placeholder="`${category.name}金额`"
                  style="width: 100%"
                  controls-position="right"
                />
              </div>
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

        <el-form-item label="标签">
          <TagInput
            v-model="formData.tagIds"
            :max-tags="5"
            @tags-updated="$emit('tags-updated')"
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
import { reactive, ref, watch, computed } from 'vue'
import { Plus, DataLine, Edit, Close } from '@element-plus/icons-vue'
import type { AssetFormData, AssetRecord, Category } from '../types'
import TagInput from './TagInput.vue'

interface Props {
  mode?: 'create' | 'edit'
  editingRecord?: AssetRecord | null
  activeCategories: Category[]
  createEmptyFormData: () => AssetFormData
  recordToFormData: (record: AssetRecord) => AssetFormData
}

const props = withDefaults(defineProps<Props>(), {
  mode: 'create',
  editingRecord: null
})

const emit = defineEmits<{
  submit: [data: AssetFormData]
  'fill-demo': []
  cancel: []
  'tags-updated': []
}>()

const formRef = ref()

const formData = reactive<AssetFormData>(props.createEmptyFormData())

const editCount = ref(0)

const activeCategories = computed(() => props.activeCategories)

watch(
  () => props.editingRecord,
  (record) => {
    if (record && props.mode === 'edit') {
      const data = props.recordToFormData(record)
      formData.date = data.date
      formData.categoryAmounts = data.categoryAmounts
      formData.note = data.note
      formData.tagIds = data.tagIds
      editCount.value = record.editCount || 0
    }
  },
  { immediate: true }
)

watch(
  () => props.activeCategories,
  () => {
    if (props.mode === 'create') {
      const data = props.createEmptyFormData()
      formData.date = data.date
      formData.categoryAmounts = data.categoryAmounts
      formData.note = data.note
      formData.tagIds = data.tagIds
    }
  },
  { deep: true }
)

const resetForm = () => {
  const data = props.createEmptyFormData()
  formData.date = data.date
  formData.categoryAmounts = data.categoryAmounts
  formData.note = data.note
  formData.tagIds = data.tagIds
  editCount.value = 0
}

const handleSubmit = () => {
  const hasPositive = formData.categoryAmounts.some(ca => (ca.amount || 0) > 0)
  if (!hasPositive) {
    return
  }
  
  emit('submit', {
    ...formData,
    categoryAmounts: formData.categoryAmounts.map(ca => ({
      categoryId: ca.categoryId,
      amount: ca.amount || 0
    }))
  })
  
  if (props.mode === 'create') {
    const data = props.createEmptyFormData()
    formData.categoryAmounts = data.categoryAmounts
    formData.note = ''
    formData.tagIds = []
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

.category-input-wrapper {
  display: flex;
  align-items: center;
  gap: 10px;
}

.color-dot {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  flex-shrink: 0;
  border: 2px solid white;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
}
</style>
