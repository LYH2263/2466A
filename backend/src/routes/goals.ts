import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import jwt from 'jsonwebtoken';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

function authMiddleware(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未提供访问令牌' });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    req.userId = decoded.userId;
    next();
  } catch (error) {
    return res.status(401).json({ error: '访问令牌无效或已过期' });
  }
}

const goalSchema = z.object({
  name: z.string().min(1, '目标名称不能为空').max(50, '目标名称最多50字'),
  targetAmount: z.number().positive('目标金额必须大于0'),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式必须为 YYYY-MM-DD'),
  scope: z.enum(['total', 'category'], { errorMap: () => ({ message: 'scope 必须为 total 或 category' }) }),
  categoryId: z.string().optional().nullable()
}).refine((data) => {
  if (data.scope === 'category' && !data.categoryId) {
    return false;
  }
  return true;
}, {
  message: '类别目标必须指定 categoryId',
  path: ['categoryId']
});

const updateGoalSchema = z.object({
  name: z.string().min(1, '目标名称不能为空').max(50, '目标名称最多50字').optional(),
  targetAmount: z.number().positive('目标金额必须大于0').optional(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式必须为 YYYY-MM-DD').optional(),
  scope: z.enum(['total', 'category']).optional(),
  categoryId: z.string().optional().nullable(),
  isCompleted: z.boolean().optional()
}).refine((data) => {
  const scope = data.scope;
  if (scope === 'category' && !data.categoryId) {
    return false;
  }
  return true;
}, {
  message: '类别目标必须指定 categoryId',
  path: ['categoryId']
});

function calcGrowthRate(records: { date: Date; value: number }[]): {
  monthlyRate: number | null;
  dailyRate: number | null;
  canPredict: boolean;
  reason?: string;
} {
  if (records.length < 2) {
    return { monthlyRate: null, dailyRate: null, canPredict: false, reason: '数据不足，至少需要2条记录' };
  }

  const sorted = records
    .filter(r => r.value > 0)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  if (sorted.length < 2) {
    return { monthlyRate: null, dailyRate: null, canPredict: false, reason: '正数记录不足' };
  }

  const n = sorted.length;
  const xValues: number[] = [];
  const yValues: number[] = [];

  const firstDate = sorted[0].date.getTime();

  for (const r of sorted) {
    const dayOffset = (r.date.getTime() - firstDate) / (1000 * 60 * 60 * 24);
    xValues.push(dayOffset);
    yValues.push(r.value);
  }

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += xValues[i];
    sumY += yValues[i];
    sumXY += xValues[i] * yValues[i];
    sumX2 += xValues[i] * xValues[i];
  }

  const denominator = n * sumX2 - sumX * sumX;
  if (Math.abs(denominator) < 1e-10) {
    return { monthlyRate: null, dailyRate: null, canPredict: false, reason: '数据无变化趋势' };
  }

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const dailyRate = slope;

  if (dailyRate <= 0) {
    return {
      monthlyRate: dailyRate * 30,
      dailyRate,
      canPredict: false,
      reason: dailyRate === 0 ? '增速为零，无法预测达成时间' : '资产呈下降趋势，无法预测达成时间'
    };
  }

  const monthlyRate = dailyRate * 30;
  return { monthlyRate, dailyRate, canPredict: true };
}

function predictAchieveDate(
  currentValue: number,
  targetValue: number,
  dailyRate: number,
  canPredict: boolean
): { estimatedDate: string | null; daysRemaining: number | null; canPredict: boolean; reason?: string } {
  if (currentValue >= targetValue) {
    return { estimatedDate: null, daysRemaining: 0, canPredict: true };
  }

  if (!canPredict || dailyRate <= 0) {
    return { estimatedDate: null, daysRemaining: null, canPredict: false, reason: '无法预测' };
  }

  const remaining = targetValue - currentValue;
  const daysRemaining = Math.ceil(remaining / dailyRate);
  const estimatedDate = new Date(Date.now() + daysRemaining * 24 * 60 * 60 * 1000);

  return {
    estimatedDate: estimatedDate.toISOString().split('T')[0],
    daysRemaining,
    canPredict: true
  };
}

async function calcGoalProgress(goal: any, userId: string) {
  const now = new Date();
  const targetDate = new Date(goal.targetDate);
  const targetAmount = Number(goal.targetAmount);
  const isExpired = targetDate < now && !goal.isCompleted;

  let currentValue = 0;
  let latestDate: string | null = null;

  if (goal.scope === 'total') {
    const latestRecord = await prisma.assetRecord.findFirst({
      where: { userId },
      orderBy: { date: 'desc' }
    });
    if (latestRecord) {
      currentValue = Number(latestRecord.total);
      latestDate = latestRecord.date.toISOString().split('T')[0];
    }
  } else if (goal.scope === 'category' && goal.categoryId) {
    const latestRecord = await prisma.assetRecord.findFirst({
      where: { userId },
      include: { assetItems: true },
      orderBy: { date: 'desc' }
    });
    if (latestRecord) {
      const item = latestRecord.assetItems.find((ai: any) => ai.categoryId === goal.categoryId);
      if (item) {
        currentValue = Number(item.amount);
      }
      latestDate = latestRecord.date.toISOString().split('T')[0];
    }
  }

  const isExceeded = currentValue >= targetAmount;
  const progressPercent = targetAmount === 0 ? 100 : Math.min((currentValue / targetAmount) * 100, 100);
  const diff = currentValue - targetAmount;
  const remaining = Math.max(targetAmount - currentValue, 0);

  let growthRecords: { date: Date; value: number }[] = [];
  const recentMonths = 6;
  const cutoffDate = new Date(now.getFullYear(), now.getMonth() - recentMonths, now.getDate());

  if (goal.scope === 'total') {
    const records = await prisma.assetRecord.findMany({
      where: {
        userId,
        date: { gte: cutoffDate }
      },
      orderBy: { date: 'asc' }
    });
    growthRecords = records.map(r => ({ date: new Date(r.date), value: Number(r.total) }));
  } else if (goal.scope === 'category' && goal.categoryId) {
    const records = await prisma.assetRecord.findMany({
      where: {
        userId,
        date: { gte: cutoffDate }
      },
      include: { assetItems: true },
      orderBy: { date: 'asc' }
    });
    growthRecords = records.map(r => {
      const item = r.assetItems.find((ai: any) => ai.categoryId === goal.categoryId);
      return { date: new Date(r.date), value: item ? Number(item.amount) : 0 };
    }).filter(r => r.value > 0);
  }

  const growth = calcGrowthRate(growthRecords);

  let prediction: {
    estimatedDate: string | null;
    daysRemaining: number | null;
    canPredict: boolean;
    reason?: string;
  };

  if (isExceeded) {
    prediction = { estimatedDate: null, daysRemaining: 0, canPredict: true };
  } else {
    prediction = predictAchieveDate(currentValue, targetAmount, growth.dailyRate || 0, growth.canPredict);
  }

  if (isExceeded && !goal.isCompleted) {
    await prisma.goal.update({
      where: { id: goal.id },
      data: { isCompleted: true }
    });
    goal.isCompleted = true;
  }

  return {
    id: goal.id,
    name: goal.name,
    scope: goal.scope,
    categoryId: goal.categoryId,
    targetAmount,
    targetDate: goal.targetDate.toISOString().split('T')[0],
    currentValue,
    latestDate,
    progressPercent: Math.round(progressPercent * 100) / 100,
    diff: Math.round(diff * 100) / 100,
    remaining: Math.round(remaining * 100) / 100,
    isExceeded,
    isCompleted: goal.isCompleted,
    isExpired,
    growth: {
      monthlyRate: growth.monthlyRate ? Math.round(growth.monthlyRate * 100) / 100 : null,
      canPredict: growth.canPredict,
      reason: growth.reason
    },
    prediction,
    createdAt: goal.createdAt.toISOString(),
    updatedAt: goal.updatedAt.toISOString()
  };
}

router.get('/', authMiddleware, async (req: any, res) => {
  try {
    const goals = await prisma.goal.findMany({
      where: { userId: req.userId },
      include: { category: { select: { id: true, name: true, color: true } } },
      orderBy: [{ isCompleted: 'asc' }, { targetDate: 'asc' }]
    });

    const goalsWithProgress = await Promise.all(
      goals.map(goal => calcGoalProgress(goal, req.userId))
    );

    res.json({ goals: goalsWithProgress });
  } catch (error) {
    console.error('Get goals error:', error);
    res.status(500).json({ error: '获取目标列表失败' });
  }
});

router.post('/', authMiddleware, async (req: any, res) => {
  try {
    const data = goalSchema.parse(req.body);

    if (data.scope === 'category' && data.categoryId) {
      const category = await prisma.category.findFirst({
        where: {
          id: data.categoryId,
          userId: req.userId,
          isActive: true,
          deletedAt: null
        }
      });
      if (!category) {
        return res.status(400).json({ error: '指定的类别不存在或已停用' });
      }
    }

    const goal = await prisma.goal.create({
      data: {
        userId: req.userId,
        name: data.name,
        targetAmount: data.targetAmount,
        targetDate: new Date(data.targetDate),
        scope: data.scope,
        categoryId: data.scope === 'category' ? data.categoryId : null
      },
      include: { category: { select: { id: true, name: true, color: true } } }
    });

    const progress = await calcGoalProgress(goal, req.userId);

    res.status(201).json({ goal: progress, message: '目标创建成功' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Create goal error:', error);
    res.status(500).json({ error: '创建目标失败' });
  }
});

router.put('/:id', authMiddleware, async (req: any, res) => {
  try {
    const { id } = req.params;
    const data = updateGoalSchema.parse(req.body);

    const existing = await prisma.goal.findFirst({
      where: { id, userId: req.userId }
    });

    if (!existing) {
      return res.status(404).json({ error: '目标不存在或无权限' });
    }

    if (data.scope === 'category' || (existing.scope === 'category' && data.scope !== 'total')) {
      const catId = data.categoryId ?? existing.categoryId;
      if (catId) {
        const category = await prisma.category.findFirst({
          where: {
            id: catId,
            userId: req.userId,
            isActive: true,
            deletedAt: null
          }
        });
        if (!category) {
          return res.status(400).json({ error: '指定的类别不存在或已停用' });
        }
      }
    }

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.targetAmount !== undefined) updateData.targetAmount = data.targetAmount;
    if (data.targetDate !== undefined) updateData.targetDate = new Date(data.targetDate);
    if (data.scope !== undefined) updateData.scope = data.scope;
    if (data.isCompleted !== undefined) updateData.isCompleted = data.isCompleted;

    if (data.scope === 'total') {
      updateData.categoryId = null;
    } else if (data.categoryId !== undefined) {
      updateData.categoryId = data.categoryId;
    }

    const updated = await prisma.goal.update({
      where: { id },
      data: updateData,
      include: { category: { select: { id: true, name: true, color: true } } }
    });

    const progress = await calcGoalProgress(updated, req.userId);

    res.json({ goal: progress, message: '目标更新成功' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Update goal error:', error);
    res.status(500).json({ error: '更新目标失败' });
  }
});

router.delete('/:id', authMiddleware, async (req: any, res) => {
  try {
    const { id } = req.params;

    const goal = await prisma.goal.findFirst({
      where: { id, userId: req.userId }
    });

    if (!goal) {
      return res.status(404).json({ error: '目标不存在或无权限' });
    }

    await prisma.goal.delete({ where: { id } });

    res.json({ message: '目标删除成功' });
  } catch (error) {
    console.error('Delete goal error:', error);
    res.status(500).json({ error: '删除目标失败' });
  }
});

export default router;
