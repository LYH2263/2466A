<template>
  <div class="asset-list">
    <el-card class="list-card">
      <template #header>
        <div class="card-header">
          <div class="header-left">
            <span>资产历史记录</span>
            <el-tag v-if="records.length > 0" type="info">共 {{ records.length }} 条</el-tag>
            <el-tag
              v-if="filterTagId"
              type="success"
              closable
              @close="handleClearFilter"
            >
              已筛选: {{ filterTagName }}
            </el-tag>
          </div>
          <div class="header-right">
            <el-select
              v-model="selectedFilterTagId"
              placeholder="按标签筛选"
              clearable
              style="width: 200px; margin-right: 10px;"
              @change="handleTagFilterChange"
            >
              <el-option
                v-for="tag in tags"
                :key="tag.id"
                :value="tag.id"
                :label="tag.name"
              >
                <div class="filter-option">
                  <span class="color-dot" :style="{ backgroundColor: tag.color }" />
                  <span>{{ tag.name }}</span>
                  <span class="tag-count">({{ tag.recordCount ?? 0 }} 条)</span>
                </div>
              </el-option>
            </el-select>
          </div>
        </div>
      </template>

      <div v-if="records.length === 0" class="empty-state">
        <el-empty description="暂无记录">
          <el-button type="primary" @click="$emit('fill-demo')">填充示例数据</el-button>
        </el-empty>
      </div>

      <el-table
        v-else
        :data="records"
        style="width: 100%"
        stripe
        border
        :default-sort="{ prop: 'date', order: 'descending' }"
      >
        <el-table-column prop="date" label="日期" width="120" sortable />
        
        <el-table-column
          v-for="category in displayCategories"
          :key="category.id"
          :label="category.name"
          min-width="140"
        >
          <template #header>
            <div class="column-header" :class="{ 'inactive-header': !category.isActive }">
              <span class="color-dot" :style="{ backgroundColor: category.color }" />
              <span>{{ category.name }}</span>
              <el-tag v-if="!category.isActive" size="small" type="info" class="inactive-tag">已停用</el-tag>
            </div>
          </template>
          <template #default="{ row }">
            <span
              class="money"
              :class="{ 'inactive-money': !category.isActive }"
              :style="{ color: category.isActive ? category.color : '#909399' }"
            >{{ formatMoney(getCategoryAmount(row, category.id)) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="总资产" min-width="120">
          <template #default="{ row }">
            <span class="money total">{{ formatMoney(row.total) }}</span>
          </template>
        </el-table-column>

        <el-table-column prop="note" label="备注" min-width="150" show-overflow-tooltip />

        <el-table-column label="标签" min-width="200">
          <template #default="{ row }">
            <div v-if="row.tags && row.tags.length > 0" class="tag-list">
              <el-tag
                v-for="tag in row.tags"
                :key="tag.id"
                :style="{ backgroundColor: tag.color, borderColor: tag.color }"
                size="small"
                class="record-tag"
                @click="handleTagClick(tag.id)"
              >
                {{ tag.name }}
              </el-tag>
            </div>
            <span v-else class="no-tags">—</span>
          </template>
        </el-table-column>

        <el-table-column label="编辑次数" width="100">
          <template #default="{ row }">
            <el-tag v-if="row.editCount > 0" type="warning" size="small">
              {{ row.editCount }} 次
            </el-tag>
            <span v-else class="no-edit">—</span>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <div class="action-btns">
              <el-button
                type="primary"
                size="small"
                :icon="Edit"
                @click="handleEdit(row)"
              >编辑</el-button>
              <el-button
                type="danger"
                size="small"
                :icon="Delete"
                @click="handleDelete(row)"
              >删除</el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Delete, Edit } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { AssetRecord, Category, Tag } from '../types'

interface Props {
  records: AssetRecord[]
  categories: Category[]
  tags: Tag[]
  filterTagId: string | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  delete: [id: string]
  edit: [record: AssetRecord]
  'fill-demo': []
  'filter-tag': [tagId: string | null]
}>()

const selectedFilterTagId = ref<string | null>(props.filterTagId)

const displayCategories = computed(() =>
  [...props.categories].sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1
    return a.sortOrder - b.sortOrder
  })
)

const filterTagName = computed(() => {
  if (!props.filterTagId) return ''
  const tag = props.tags.find(t => t.id === props.filterTagId)
  return tag?.name || ''
})

const handleTagFilterChange = (value: string | null) => {
  selectedFilterTagId.value = value
  emit('filter-tag', value)
}

const setFilterTag = (tagId: string) => {
  selectedFilterTagId.value = tagId
  emit('filter-tag', tagId)
}

const handleTagClick = (tagId: string) => {
  setFilterTag(tagId)
}

const handleClearFilter = () => {
  selectedFilterTagId.value = null
  emit('filter-tag', null)
}

watch(() => props.filterTagId, (newVal) => {
  selectedFilterTagId.value = newVal
})

const getCategoryAmount = (record: AssetRecord, categoryId: string): number => {
  return record.categoryAmounts?.[categoryId] ?? 0
}

const formatMoney = (value: number): string => {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 2
  }).format(value)
}

const handleEdit = (row: AssetRecord) => {
  emit('edit', row)
}

const handleDelete = (row: AssetRecord) => {
  ElMessageBox.confirm(
    `确定要删除 ${row.date} 的记录吗？`,
    '确认删除',
    {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    }
  )
    .then(() => {
      emit('delete', row.id)
      ElMessage.success('删除成功')
    })
    .catch(() => {
      // Cancelled
    })
}
</script>

<style scoped>
.asset-list {
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 16px;
  font-weight: 600;
  flex-wrap: wrap;
  gap: 10px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.filter-option {
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

.column-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
}

.column-header.inactive-header {
  opacity: 0.7;
}

.inactive-tag {
  font-weight: normal;
  margin-left: 2px;
}

.inactive-money {
  opacity: 0.6;
  text-decoration: line-through;
  text-decoration-style: dotted;
}

.tag-count {
  color: #909399;
  font-size: 12px;
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.record-tag {
  color: white !important;
  font-weight: 500;
  border: 1px solid;
  cursor: pointer;
  transition: opacity 0.2s;
}

.record-tag:hover {
  opacity: 0.8;
}

.no-tags {
  color: #909399;
}

.empty-state {
  padding: 60px 0;
}

.money {
  font-family: 'Courier New', monospace;
  font-weight: 600;
}

.total {
  color: #f56c6c;
  font-weight: 700;
}

.no-edit {
  color: #909399;
}

.action-btns {
  display: flex;
  gap: 8px;
}
</style>
