<template>
  <div class="tag-manager">
    <el-card class="manager-card">
      <template #header>
        <div class="card-header">
          <span>标签管理</span>
          <el-button
            type="primary"
            size="small"
            :icon="Plus"
            @click="showCreateDialog"
          >
            新建标签
          </el-button>
        </div>
      </template>

      <div v-if="loading" class="loading-state">
        <el-skeleton :rows="5" animated />
      </div>

      <div v-else-if="tags.length === 0" class="empty-state">
        <el-empty description="暂无标签">
          <el-button type="primary" @click="showCreateDialog">创建第一个标签</el-button>
        </el-empty>
      </div>

      <el-table v-else :data="tags" style="width: 100%">
        <el-table-column label="标签名称" min-width="150">
          <template #default="{ row }">
            <div class="tag-display">
              <span class="color-dot" :style="{ backgroundColor: row.color }" />
              <span>{{ row.name }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="颜色" width="120">
          <template #default="{ row }">
            <el-tag :style="{ backgroundColor: row.color, borderColor: row.color }">
              {{ row.color }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="引用次数" width="120">
          <template #default="{ row }">
            <el-tag type="info" size="small">
              {{ row.recordCount ?? 0 }} 条
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="创建时间" width="180">
          <template #default="{ row }">
            {{ formatDate(row.createdAt) }}
          </template>
        </el-table-column>

        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <div class="action-btns">
              <el-button
                type="primary"
                size="small"
                :icon="Edit"
                @click="showEditDialog(row)"
              >
                编辑
              </el-button>
              <el-button
                type="danger"
                size="small"
                :icon="Delete"
                @click="handleDelete(row)"
              >
                删除
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑标签' : '新建标签'"
      width="400px"
      @closed="resetForm"
    >
      <el-form ref="formRef" :model="formData" label-width="80px">
        <el-form-item label="标签名称" required>
          <el-input
            v-model="formData.name"
            placeholder="请输入标签名称"
            maxlength="30"
            show-word-limit
          />
        </el-form-item>

        <el-form-item label="标签颜色" required>
          <el-color-picker
            v-model="formData.color"
            :predefine="presetColors"
            show-alpha
            alpha-change="false"
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit" :loading="submitting">
          {{ isEdit ? '保存' : '创建' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Plus, Edit, Delete } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { useTags } from '../composables/useTags'
import type { Tag } from '../types'

const emit = defineEmits<{
  'tags-updated': []
}>()

const { tags, loading, fetchTags, createTag, updateTag, deleteTag, getPresetColors } = useTags()

const dialogVisible = ref(false)
const isEdit = ref(false)
const submitting = ref(false)
const editingTag = ref<Tag | null>(null)
const formRef = ref<FormInstance>()
const presetColors = ref<string[]>([])

const formData = ref({
  name: '',
  color: '#67c23a'
})

const showCreateDialog = async () => {
  isEdit.value = false
  editingTag.value = null
  const colors = await getPresetColors()
  presetColors.value = colors.availableColors
  formData.value = {
    name: '',
    color: colors.nextSuggestedColor
  }
  dialogVisible.value = true
}

const showEditDialog = async (row: Tag) => {
  isEdit.value = true
  editingTag.value = row
  const colors = await getPresetColors()
  presetColors.value = [...colors.availableColors, row.color.toLowerCase()]
  formData.value = {
    name: row.name,
    color: row.color
  }
  dialogVisible.value = true
}

const resetForm = () => {
  formData.value = {
    name: '',
    color: '#67c23a'
  }
  editingTag.value = null
  isEdit.value = false
}

const handleSubmit = async () => {
  if (!formData.value.name.trim()) {
    ElMessage.warning('请输入标签名称')
    return
  }

  submitting.value = true
  try {
    if (isEdit.value && editingTag.value) {
      const result = await updateTag(editingTag.value.id, {
        name: formData.value.name.trim(),
        color: formData.value.color
      })
      
      if (result.success) {
        ElMessage.success('标签更新成功')
        dialogVisible.value = false
        emit('tags-updated')
      } else {
        ElMessage.error(result.error || '更新失败')
      }
    } else {
      const result = await createTag(
        formData.value.name.trim(),
        formData.value.color
      )
      
      if (result.success) {
        ElMessage.success('标签创建成功')
        dialogVisible.value = false
        emit('tags-updated')
      } else {
        ElMessage.error(result.error || '创建失败')
      }
    }
  } finally {
    submitting.value = false
  }
}

const handleDelete = async (row: Tag) => {
  const result = await deleteTag(row.id, false)
  
  if (result.needConfirm && result.referencedCount) {
    try {
      await ElMessageBox.confirm(
        result.error,
        '确认删除',
        {
          confirmButtonText: '确认删除',
          cancelButtonText: '取消',
          type: 'warning'
        }
      )
      
      const cascadeResult = await deleteTag(row.id, true)
      if (cascadeResult.success) {
        ElMessage.success('标签删除成功')
        emit('tags-updated')
      } else {
        ElMessage.error(cascadeResult.error || '删除失败')
      }
    } catch {
      // Cancelled
    }
  } else if (result.success) {
    ElMessage.success('标签删除成功')
    emit('tags-updated')
  } else {
    ElMessage.error(result.error || '删除失败')
  }
}

const formatDate = (dateStr: string): string => {
  return new Date(dateStr).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

onMounted(() => {
  if (tags.value.length === 0) {
    fetchTags()
  }
})
</script>

<style scoped>
.tag-manager {
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 16px;
  font-weight: 600;
}

.tag-display {
  display: flex;
  align-items: center;
  gap: 8px;
}

.color-dot {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid white;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
}

.action-btns {
  display: flex;
  gap: 8px;
}

.loading-state,
.empty-state {
  padding: 40px 0;
}

:deep(.el-tag) {
  color: white !important;
  font-weight: 500;
  border: 1px solid;
}
</style>
