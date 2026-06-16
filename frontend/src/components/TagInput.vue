<template>
  <div class="tag-input-wrapper">
    <div class="selected-tags">
      <el-tag
        v-for="tag in selectedTagObjects"
        :key="tag.id"
        :style="{ backgroundColor: tag.color, borderColor: tag.color }"
        class="tag-item"
        closable
        @close="handleRemoveTag(tag.id)"
      >
        {{ tag.name }}
      </el-tag>
    </div>
    
    <div class="input-container">
      <el-select
        v-model="inputValue"
        filterable
        remote
        reserve-keyword
        placeholder="输入标签名称，回车创建或选择"
        :remote-method="handleSearch"
        :loading="searchLoading"
        :disabled="isDisabled"
        class="tag-select"
        @keyup.enter="handleCreateTag"
        @change="handleSelectTag"
        @visible-change="handleVisibleChange"
      >
        <el-option
          v-for="tag in filteredOptions"
          :key="tag.id"
          :value="tag.id"
          :label="tag.name"
        >
          <div class="option-item">
            <span class="color-dot" :style="{ backgroundColor: tag.color }" />
            <span class="tag-name">{{ tag.name }}</span>
            <span v-if="tag.recordCount !== undefined" class="tag-count">
              {{ tag.recordCount }} 条
            </span>
          </div>
        </el-option>
        
        <el-option
          v-if="showCreateOption && inputValue.trim()"
          :value="'__create__'"
          :label="`创建标签: ${inputValue.trim()}`"
          class="create-option"
        >
          <div class="create-option-content">
            <el-icon><Plus /></el-icon>
            <span>创建标签: {{ inputValue.trim() }}</span>
          </div>
        </el-option>
      </el-select>
      
      <div v-if="selectedTagIds.length >= maxTags" class="max-tips">
        最多添加 {{ maxTags }} 个标签
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Plus } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { Tag } from '../types'
import { useTags } from '../composables/useTags'

interface Props {
  modelValue: string[]
  maxTags?: number
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  maxTags: 5,
  disabled: false
})

const emit = defineEmits<{
  'update:modelValue': [value: string[]]
  'tags-updated': []
}>()

const { tags, createTag, getOrCreateTag, fetchTags } = useTags()

const inputValue = ref('')
const searchLoading = ref(false)
const filteredOptions = ref<Tag[]>([])
const dropdownVisible = ref(false)

const isDisabled = computed(() => 
  props.disabled || selectedTagIds.value.length >= props.maxTags
)

const selectedTagIds = computed(() => props.modelValue)

const selectedTagObjects = computed(() => 
  selectedTagIds.value
    .map(id => tags.value.find(t => t.id === id))
    .filter((t): t is Tag => t !== undefined)
)

const showCreateOption = computed(() => {
  if (!inputValue.value.trim()) return false
  if (selectedTagIds.value.length >= props.maxTags) return false
  
  const existing = tags.value.find(t => 
    t.name.toLowerCase() === inputValue.value.trim().toLowerCase()
  )
  
  return !existing
})

const handleSearch = (query: string) => {
  if (!query) {
    filteredOptions.value = tags.value.filter(
      t => !selectedTagIds.value.includes(t.id)
    )
    return
  }

  searchLoading.value = true
  setTimeout(() => {
    const lowerQuery = query.toLowerCase().trim()
    filteredOptions.value = tags.value.filter(t => 
      !selectedTagIds.value.includes(t.id) &&
      t.name.toLowerCase().includes(lowerQuery)
    )
    searchLoading.value = false
  }, 100)
}

const handleSelectTag = (value: string) => {
  if (value === '__create__') {
    handleCreateTag()
    return
  }

  if (selectedTagIds.value.length >= props.maxTags) {
    ElMessage.warning(`最多添加 ${props.maxTags} 个标签`)
    inputValue.value = ''
    return
  }

  if (!selectedTagIds.value.includes(value)) {
    const newValue = [...selectedTagIds.value, value]
    emit('update:modelValue', newValue)
    emit('tags-updated')
  }
  
  inputValue.value = ''
}

const handleCreateTag = async () => {
  const name = inputValue.value.trim()
  if (!name) return

  if (selectedTagIds.value.length >= props.maxTags) {
    ElMessage.warning(`最多添加 ${props.maxTags} 个标签`)
    return
  }

  const existingTag = tags.value.find(t => 
    t.name.toLowerCase() === name.toLowerCase()
  )

  if (existingTag) {
    if (!selectedTagIds.value.includes(existingTag.id)) {
      const newValue = [...selectedTagIds.value, existingTag.id]
      emit('update:modelValue', newValue)
      emit('tags-updated')
    }
    inputValue.value = ''
    return
  }

  const result = await createTag(name)
  if (result.success && result.tag) {
    const newValue = [...selectedTagIds.value, result.tag.id]
    emit('update:modelValue', newValue)
    emit('tags-updated')
    ElMessage.success(`标签 "${name}" 创建成功`)
  } else {
    ElMessage.error(result.error || '创建标签失败')
  }
  
  inputValue.value = ''
}

const handleRemoveTag = async (tagId: string) => {
  const tag = tags.value.find(t => t.id === tagId)
  if (!tag) return

  try {
    await ElMessageBox.confirm(
      `确定要移除标签 "${tag.name}" 吗？`,
      '移除标签',
      {
        confirmButtonText: '移除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    
    const newValue = selectedTagIds.value.filter(id => id !== tagId)
    emit('update:modelValue', newValue)
    emit('tags-updated')
  } catch {
    // Cancelled
  }
}

const handleVisibleChange = (visible: boolean) => {
  dropdownVisible.value = visible
  if (!visible) {
    inputValue.value = ''
  } else {
    handleSearch('')
  }
}

watch(() => tags.value, () => {
  if (dropdownVisible.value) {
    handleSearch(inputValue.value)
  }
}, { deep: true })

// Initialize tags if not loaded
if (tags.value.length === 0) {
  fetchTags()
}
</script>

<style scoped>
.tag-input-wrapper {
  width: 100%;
}

.selected-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
  min-height: 32px;
}

.tag-item {
  color: white !important;
  font-weight: 500;
  border: 1px solid;
}

.tag-item :deep(.el-tag__close) {
  color: white;
}

.tag-item :deep(.el-tag__close:hover) {
  color: rgba(255, 255, 255, 0.8);
  background-color: rgba(0, 0, 0, 0.1);
}

.input-container {
  position: relative;
}

.tag-select {
  width: 100%;
}

.option-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.color-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
  border: 1px solid rgba(255, 255, 255, 0.5);
}

.tag-name {
  flex: 1;
}

.tag-count {
  color: #909399;
  font-size: 12px;
}

.create-option-content {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #409eff;
}

.max-tips {
  color: #e6a23c;
  font-size: 12px;
  margin-top: 4px;
}
</style>
