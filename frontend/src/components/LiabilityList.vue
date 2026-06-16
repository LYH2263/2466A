<template>
  <el-card class="liability-list-card" shadow="hover">
    <template #header>
      <div class="card-header">
        <div class="header-title">
          <el-icon class="header-icon"><List /></el-icon>
          <span>负债记录</span>
          <el-tag
            v-if="records.length > 0"
            type="danger"
            size="small"
            effect="light"
          >
            共 {{ records.length }} 条
          </el-tag>
        </div>
      </div>
    </template>

    <el-empty
      v-if="!loading && records.length === 0"
      description="暂无负债记录，点击上方添加新负债"
    >
      <el-button type="primary" @click="$emit('fill-demo')">填充示例数据</el-button>
    </el-empty>

    <template v-else>
      <el-table
        :data="records"
        stripe
        style="width: 100%"
        v-loading="loading"
      >
        <el-table-column prop="date" label="日期" width="130" sortable>
          <template #default="{ row }">
            <span>{{ row.date }}</span>
          </template>
        </el-table-column>

        <el-table-column prop="name" label="名称" min-width="150">
          <template #default="{ row }">
            <el-tag type="danger" effect="light">{{ row.name }}</el-tag>
          </template>
        </el-table-column>

        <el-table-column prop="amount" label="剩余金额" width="160" sortable align="right">
          <template #default="{ row }">
            <span class="amount-danger">¥{{ formatMoney(row.amount) }}</span>
          </template>
        </el-table-column>

        <el-table-column prop="note" label="备注" min-width="200" show-overflow-tooltip />

        <el-table-column label="操作" width="160" fixed="right" align="center">
          <template #default="{ row }">
            <el-button
              type="primary"
              link
              size="small"
              :icon="Edit"
              @click="handleEdit(row)"
            >
              编辑
            </el-button>
            <el-button
              type="danger"
              link
              size="small"
              :icon="Delete"
              @click="handleDelete(row)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </template>
  </el-card>
</template>

<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { List, Edit, Delete } from '@element-plus/icons-vue'
import type { LiabilityRecord } from '../types'

interface Props {
  records: LiabilityRecord[]
  loading: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  edit: [record: LiabilityRecord]
  delete: [id: string]
  'fill-demo': []
}>()

const formatMoney = (value: number): string => {
  return new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value)
}

const handleEdit = (row: LiabilityRecord) => {
  emit('edit', row)
}

const handleDelete = async (row: LiabilityRecord) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除负债「${row.name}」吗？`,
      '确认删除',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    emit('delete', row.id)
  } catch (err) {
    // Cancelled
  }
}
</script>

<style scoped>
.liability-list-card {
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-title {
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

.amount-danger {
  color: #f56c6c;
  font-weight: 600;
}
</style>
