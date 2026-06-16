<template>
  <div class="category-manager">
    <el-card class="manager-card">
      <template #header>
        <div class="card-header">
          <span>类别管理</span>
          <div class="header-actions">
            <el-tag type="info" size="small">{{ allCategories.length }} / 10 个类别</el-tag>
            <el-button
              type="primary"
              size="small"
              :icon="Plus"
              :disabled="allCategories.length >= 10"
              @click="showCreateDialog = true"
            >
              新增类别
            </el-button>
          </div>
        </div>
      </template>

      <div v-if="loading" class="loading-state">
        <el-skeleton :rows="3" animated />
      </div>

      <div v-else class="category-list">
        <draggable
          v-model="sortedCategories"
          item-key="id"
          handle=".drag-handle"
          ghost-class="ghost"
          chosen-class="chosen"
          drag-class="drag"
          animation="200"
          @end="handleDragEnd"
        >
          <template #item="{ element }">
            <div class="category-item" :class="{ inactive: !element.isActive }">
              <div class="drag-handle">
                <el-icon><Rank /></el-icon>
              </div>

              <div class="color-indicator" :style="{ backgroundColor: element.color }" />

              <div class="category-info">
                <div class="category-name">
                  {{ element.name }}
                  <el-tag v-if="element.isDefault" type="success" size="small" style="margin-left: 8px;">默认</el-tag>
                  <el-tag v-if="!element.isActive" type="info" size="small" style="margin-left: 8px;">已停用</el-tag>
                </div>
              </div>

              <div class="category-actions">
                <el-tooltip content="编辑">
                  <el-button
                    type="primary"
                    link
                    size="small"
                    :icon="Edit"
                    @click="startEdit(element)"
                  />
                </el-tooltip>
                <el-tooltip :content="element.isActive ? '停用' : '启用'">
                  <el-button
                    type="warning"
                    link
                    size="small"
                    :icon="element.isActive ? 'Close' : 'Check'"
                    :disabled="element.isDefault"
                    @click="toggleActive(element)"
                  />
                </el-tooltip>
                <el-tooltip content="删除">
                  <el-button
                    type="danger"
                    link
                    size="small"
                    :icon="Delete"
                    :disabled="element.isDefault"
                    @click="handleDelete(element)"
                  />
                </el-tooltip>
              </div>
            </div>
          </template>
        </draggable>

        <div v-if="allCategories.length === 0" class="empty-state">
          <el-empty description="暂无类别" />
        </div>
      </div>
    </el-card>

    <el-dialog
      v-model="showCreateDialog"
      title="新增类别"
      width="480px"
      @close="resetCreateForm"
    >
      <el-form :model="createForm" label-position="top">
        <el-form-item label="类别名称" required>
          <el-input
            v-model="createForm.name"
            placeholder="请输入类别名称"
            maxlength="50"
            show-word-limit
            @keyup.enter="handleCreate"
          />
        </el-form-item>
        <el-form-item label="颜色" required>
          <div class="color-picker-wrapper">
            <el-color-picker
              v-model="createForm.color"
              :predefine="availableColors"
              size="large"
              show-alpha="false"
            />
            <span class="color-value">{{ createForm.color }}</span>
          </div>
          <div class="preset-colors">
            <div
              v-for="color in presetColors"
              :key="color"
              class="preset-color"
              :class="{ used: usedColors.includes(color.toLowerCase()), selected: createForm.color === color }"
              :style="{ backgroundColor: color }"
              @click="!usedColors.includes(color.toLowerCase()) && (createForm.color = color)"
            >
              <el-icon v-if="usedColors.includes(color.toLowerCase())" class="used-icon"><Lock /></el-icon>
            </div>
          </div>
          <div class="color-tip">
            <el-icon><InfoFilled /></el-icon>
            <span>已使用的颜色不可重复选择</span>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" :loading="createLoading" @click="handleCreate">创建</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="showEditDialog"
      title="编辑类别"
      width="480px"
      @close="resetEditForm"
    >
      <el-form :model="editForm" label-position="top">
        <el-form-item label="类别名称" required>
          <el-input
            v-model="editForm.name"
            placeholder="请输入类别名称"
            maxlength="50"
            show-word-limit
            @keyup.enter="handleEditSave"
          />
        </el-form-item>
        <el-form-item label="颜色" required>
          <div class="color-picker-wrapper">
            <el-color-picker
              v-model="editForm.color"
              :predefine="editAvailableColors"
              size="large"
              show-alpha="false"
            />
            <span class="color-value">{{ editForm.color }}</span>
          </div>
          <div class="preset-colors">
            <div
              v-for="color in presetColors"
              :key="color"
              class="preset-color"
              :class="{
                used: editUsedColors.includes(color.toLowerCase()) && editingCategory?.color.toLowerCase() !== color.toLowerCase(),
                selected: editForm.color === color
              }"
              :style="{ backgroundColor: color }"
              @click="handleSelectColor(color)"
            >
              <el-icon
                v-if="editUsedColors.includes(color.toLowerCase()) && editingCategory?.color.toLowerCase() !== color.toLowerCase()"
                class="used-icon"
              ><Lock /></el-icon>
            </div>
          </div>
          <div class="color-tip">
            <el-icon><InfoFilled /></el-icon>
            <span>已使用的颜色不可重复选择</span>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEditDialog = false">取消</el-button>
        <el-button type="primary" :loading="editLoading" @click="handleEditSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { Plus, Edit, Delete, Rank, Lock, InfoFilled, Check, Close } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import draggable from 'vuedraggable'
import { useCategories } from '../composables/useCategories'
import type { Category } from '../types'

const {
  allCategories,
  loading,
  fetchCategories,
  createCategory,
  updateCategory,
  reorderCategories,
  deleteCategory,
  getPresetColors
} = useCategories()

const showCreateDialog = ref(false)
const showEditDialog = ref(false)
const createLoading = ref(false)
const editLoading = ref(false)

const createForm = ref({
  name: '',
  color: '#67c23a'
})

const editForm = ref({
  name: '',
  color: '#67c23a'
})

const editingCategory = ref<Category | null>(null)
const presetColors = ref<string[]>([])
const usedColors = ref<string[]>([])
const availableColors = ref<string[]>([])

const sortedCategories = computed({
  get: () => [...allCategories.value].sort((a, b) => a.sortOrder - b.sortOrder),
  set: (val) => {
    allCategories.value = val
  }
})

const editUsedColors = computed(() => {
  if (!editingCategory.value) return usedColors.value
  return usedColors.value.filter(c => c !== editingCategory.value!.color.toLowerCase())
})

const editAvailableColors = computed(() => {
  if (!editingCategory.value) return availableColors.value
  return [...availableColors.value, editingCategory.value.color]
})

const loadPresetColors = async () => {
  try {
    const data = await getPresetColors()
    presetColors.value = data.presetColors
    usedColors.value = data.usedColors
    availableColors.value = data.availableColors
    if (data.nextSuggestedColor && !createForm.value.color) {
      createForm.value.color = data.nextSuggestedColor
    }
  } catch (err) {
    console.error('Failed to load preset colors:', err)
  }
}

const resetCreateForm = () => {
  createForm.value = {
    name: '',
    color: availableColors.value[0] || '#67c23a'
  }
}

const resetEditForm = () => {
  editForm.value = { name: '', color: '#67c23a' }
  editingCategory.value = null
}

const handleCreate = async () => {
  if (!createForm.value.name.trim()) {
    ElMessage.warning('请输入类别名称')
    return
  }

  if (!createForm.value.color) {
    ElMessage.warning('请选择颜色')
    return
  }

  createLoading.value = true
  try {
    const result = await createCategory(createForm.value.name.trim(), createForm.value.color)
    if (result.success) {
      ElMessage.success('类别创建成功')
      showCreateDialog.value = false
      resetCreateForm()
      await loadPresetColors()
      emit('categories-updated')
    } else {
      ElMessage.error(result.error || '创建失败')
    }
  } finally {
    createLoading.value = false
  }
}

const startEdit = (category: Category) => {
  editingCategory.value = category
  editForm.value = {
    name: category.name,
    color: category.color
  }
  showEditDialog.value = true
}

const handleSelectColor = (color: string) => {
  const lowerColor = color.toLowerCase()
  if (!editingCategory.value) {
    if (!usedColors.value.includes(lowerColor)) {
      editForm.value.color = color
    }
  } else {
    if (!usedColors.value.includes(lowerColor) || editingCategory.value.color.toLowerCase() === lowerColor) {
      editForm.value.color = color
    }
  }
}

const handleEditSave = async () => {
  if (!editingCategory.value) return

  if (!editForm.value.name.trim()) {
    ElMessage.warning('请输入类别名称')
    return
  }

  if (!editForm.value.color) {
    ElMessage.warning('请选择颜色')
    return
  }

  editLoading.value = true
  try {
    const result = await updateCategory(editingCategory.value.id, {
      name: editForm.value.name.trim(),
      color: editForm.value.color
    })
    if (result.success) {
      ElMessage.success('类别更新成功')
      showEditDialog.value = false
      resetEditForm()
      await loadPresetColors()
      emit('categories-updated')
    } else {
      ElMessage.error(result.error || '更新失败')
    }
  } finally {
    editLoading.value = false
  }
}

const toggleActive = async (category: Category) => {
  const action = category.isActive ? '停用' : '启用'
  try {
    await ElMessageBox.confirm(
      `确定要${action}类别"${category.name}"吗？${category.isActive ? '停用后将不在录入表单中显示，但历史数据仍保留。' : ''}`,
      `确认${action}`,
      {
        confirmButtonText: action,
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    const result = await updateCategory(category.id, {
      isActive: !category.isActive
    })

    if (result.success) {
      ElMessage.success(`类别已${action}`)
      emit('categories-updated')
    } else {
      ElMessage.error(result.error || `${action}失败`)
    }
  } catch (err) {
    // Cancelled
  }
}

const handleDelete = async (category: Category) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除类别"${category.name}"吗？此操作不可恢复。`,
      '确认删除',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'danger'
      }
    )

    const result = await deleteCategory(category.id)

    if (result.success) {
      ElMessage.success('类别删除成功')
      await loadPresetColors()
      emit('categories-updated')
    } else if (result.hasHistory) {
      ElMessageBox.confirm(
        result.error,
        '无法删除',
        {
          confirmButtonText: '去停用',
          cancelButtonText: '取消',
          type: 'warning'
        }
      ).then(() => {
        toggleActive(category)
      }).catch(() => {})
    } else {
      ElMessage.error(result.error || '删除失败')
    }
  } catch (err) {
    // Cancelled
  }
}

let dragTimer: any = null

const handleDragEnd = async () => {
  if (dragTimer) clearTimeout(dragTimer)
  
  dragTimer = setTimeout(async () => {
    const orders = sortedCategories.value.map((cat, index) => ({
      id: cat.id,
      sortOrder: index
    }))

    const result = await reorderCategories(orders)
    if (!result.success) {
      ElMessage.error(result.error || '更新排序失败')
      await fetchCategories()
    } else {
      emit('categories-updated')
    }
  }, 300)
}

const emit = defineEmits<{
  'categories-updated': []
}>()

onMounted(async () => {
  await fetchCategories()
  await loadPresetColors()
})

watch(showCreateDialog, (val) => {
  if (val) {
    loadPresetColors()
  }
})

watch(showEditDialog, (val) => {
  if (val) {
    loadPresetColors()
  }
})
</script>

<style scoped>
.category-manager {
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 16px;
  font-weight: 600;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.category-list {
  min-height: 200px;
}

.category-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  margin-bottom: 8px;
  background: #fafafa;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  transition: all 0.2s;
}

.category-item:hover {
  background: #f5f7fa;
  border-color: #dcdfe6;
}

.category-item.inactive {
  opacity: 0.6;
  background: #f5f5f5;
}

.drag-handle {
  cursor: move;
  color: #c0c4cc;
  font-size: 18px;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s;
}

.drag-handle:hover {
  color: #909399;
  background: #e4e7ed;
}

.color-indicator {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  flex-shrink: 0;
  border: 2px solid white;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.category-info {
  flex: 1;
  min-width: 0;
}

.category-name {
  font-size: 15px;
  font-weight: 500;
  color: #303133;
}

.category-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.ghost {
  opacity: 0.5;
  background: #c8ebfb;
}

.chosen {
  background: #ecf5ff;
  border-color: #409eff;
}

.drag {
  transform: rotate(3deg);
}

.loading-state {
  padding: 20px 0;
}

.empty-state {
  padding: 40px 0;
}

.color-picker-wrapper {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 12px;
}

.color-value {
  font-family: 'Courier New', monospace;
  font-size: 14px;
  color: #606266;
}

.preset-colors {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}

.preset-color {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  cursor: pointer;
  border: 2px solid transparent;
  transition: all 0.2s;
  position: relative;
}

.preset-color:hover {
  transform: scale(1.15);
}

.preset-color.selected {
  border-color: #303133;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.preset-color.used {
  cursor: not-allowed;
  opacity: 0.5;
}

.preset-color.used:hover {
  transform: none;
}

.used-icon {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: white;
  font-size: 14px;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
}

.color-tip {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #909399;
}
</style>
