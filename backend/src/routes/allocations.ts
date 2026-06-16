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

const allocationItemSchema = z.object({
  categoryId: z.string(),
  percentage: z.number().min(0).max(100)
});

const upsertAllocationSchema = z.object({
  allocations: z.array(allocationItemSchema).min(1, '至少需要一个类别配置'),
  warningThreshold: z.number().min(1).max(50).default(10)
}).refine((data) => {
  const sum = data.allocations.reduce((s, a) => s + a.percentage, 0);
  return Math.abs(sum - 100) < 0.01;
}, {
  message: '目标比例之和必须为100%',
  path: ['allocations']
}).refine((data) => {
  const ids = data.allocations.map(a => a.categoryId);
  return new Set(ids).size === ids.length;
}, {
  message: '类别不能重复',
  path: ['allocations']
});

function computeRebalance(
  actualAmounts: Record<string, number>,
  targetPercentages: Record<string, number>,
  totalAsset: number,
  warningThreshold: number
) {
  const categoryIds = new Set([
    ...Object.keys(actualAmounts),
    ...Object.keys(targetPercentages)
  ]);

  const items: {
    categoryId: string;
    actualAmount: number;
    actualPercent: number;
    targetPercent: number;
    targetAmount: number;
    diffAmount: number;
    diffPercent: number;
    isWarning: boolean;
    rebalanceAmount: number;
  }[] = [];

  const rawRebalance: { categoryId: string; raw: number }[] = [];

  for (const catId of categoryIds) {
    const actual = actualAmounts[catId] ?? 0;
    const targetPct = targetPercentages[catId] ?? 0;
    const actualPct = totalAsset > 0 ? (actual / totalAsset) * 100 : 0;
    const targetAmt = totalAsset * (targetPct / 100);
    const diffAmt = actual - targetAmt;
    const diffPct = actualPct - targetPct;
    const isWarning = Math.abs(diffPct) > warningThreshold;

    const rawRebalanceAmt = -diffAmt;

    rawRebalance.push({ categoryId: catId, raw: rawRebalanceAmt });

    items.push({
      categoryId: catId,
      actualAmount: Math.round(actual * 100) / 100,
      actualPercent: Math.round(actualPct * 100) / 100,
      targetPercent: Math.round(targetPct * 100) / 100,
      targetAmount: Math.round(targetAmt * 100) / 100,
      diffAmount: Math.round(diffAmt * 100) / 100,
      diffPercent: Math.round(diffPct * 100) / 100,
      isWarning,
      rebalanceAmount: 0
    });
  }

  const rounded = rawRebalance.map(r => ({
    categoryId: r.categoryId,
    rebalanceAmount: Math.round(r.raw * 100) / 100
  }));

  const totalRounded = rounded.reduce((s, r) => s + r.rebalanceAmount, 0);
  const roundingError = Math.round((0 - totalRounded) * 100) / 100;

  if (Math.abs(roundingError) >= 0.01) {
    const nonZeroItems = rounded
      .filter(r => Math.abs(r.rebalanceAmount) >= 0.01)
      .sort((a, b) => Math.abs(b.rebalanceAmount) - Math.abs(a.rebalanceAmount));

    if (nonZeroItems.length > 0) {
      const adjustmentTarget = roundingError > 0
        ? nonZeroItems.find(r => r.rebalanceAmount > 0)
        : nonZeroItems.find(r => r.rebalanceAmount < 0);

      if (adjustmentTarget) {
        adjustmentTarget.rebalanceAmount = Math.round(
          (adjustmentTarget.rebalanceAmount + roundingError) * 100
        ) / 100;
      } else {
        nonZeroItems[0].rebalanceAmount = Math.round(
          (nonZeroItems[0].rebalanceAmount + roundingError) * 100
        ) / 100;
      }
    }
  }

  const rebalanceMap = new Map(rounded.map(r => [r.categoryId, r.rebalanceAmount]));
  for (const item of items) {
    item.rebalanceAmount = rebalanceMap.get(item.categoryId) ?? 0;
  }

  const finalSum = items.reduce((s, i) => s + i.rebalanceAmount, 0);

  return {
    totalAsset: Math.round(totalAsset * 100) / 100,
    warningThreshold,
    items,
    roundingCorrection: roundingError,
    rebalanceSum: Math.round(finalSum * 100) / 100
  };
}

router.get('/', authMiddleware, async (req: any, res) => {
  try {
    const allocation = await prisma.targetAllocation.findUnique({
      where: { userId: req.userId }
    });

    if (!allocation) {
      return res.json({
        allocation: null,
        hasTarget: false
      });
    }

    const allocations = allocation.allocations as { categoryId: string; percentage: number }[];

    res.json({
      allocation: {
        id: allocation.id,
        allocations,
        warningThreshold: Number(allocation.warningThreshold),
        createdAt: allocation.createdAt.toISOString(),
        updatedAt: allocation.updatedAt.toISOString()
      },
      hasTarget: true
    });
  } catch (error) {
    console.error('Get target allocation error:', error);
    res.status(500).json({ error: '获取目标配置失败' });
  }
});

router.put('/', authMiddleware, async (req: any, res) => {
  try {
    const data = upsertAllocationSchema.parse(req.body);

    const activeCategories = await prisma.category.findMany({
      where: { userId: req.userId, isActive: true, deletedAt: null }
    });
    const activeIds = new Set(activeCategories.map(c => c.id));

    for (const a of data.allocations) {
      if (!activeIds.has(a.categoryId)) {
        return res.status(400).json({ error: `类别 ${a.categoryId} 不存在或已停用` });
      }
    }

    const allocationData = data.allocations.map(a => ({
      categoryId: a.categoryId,
      percentage: Math.round(a.percentage * 100) / 100
    }));

    const allocation = await prisma.targetAllocation.upsert({
      where: { userId: req.userId },
      update: {
        allocations: allocationData,
        warningThreshold: data.warningThreshold
      },
      create: {
        userId: req.userId,
        allocations: allocationData,
        warningThreshold: data.warningThreshold
      }
    });

    res.json({
      allocation: {
        id: allocation.id,
        allocations: allocationData,
        warningThreshold: Number(allocation.warningThreshold),
        createdAt: allocation.createdAt.toISOString(),
        updatedAt: allocation.updatedAt.toISOString()
      },
      message: '目标配置保存成功'
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Upsert target allocation error:', error);
    res.status(500).json({ error: '保存目标配置失败' });
  }
});

router.get('/rebalance', authMiddleware, async (req: any, res) => {
  try {
    const allocation = await prisma.targetAllocation.findUnique({
      where: { userId: req.userId }
    });

    if (!allocation) {
      return res.json({
        hasTarget: false,
        hasLatest: false,
        rebalance: null
      });
    }

    const targetAllocations = allocation.allocations as { categoryId: string; percentage: number }[];
    const targetPercentages: Record<string, number> = {};
    for (const a of targetAllocations) {
      targetPercentages[a.categoryId] = a.percentage;
    }

    const latestRecord = await prisma.assetRecord.findFirst({
      where: { userId: req.userId },
      include: { assetItems: true },
      orderBy: { date: 'desc' }
    });

    if (!latestRecord) {
      return res.json({
        hasTarget: true,
        hasLatest: false,
        latestDate: null,
        rebalance: null
      });
    }

    const allCategories = await prisma.category.findMany({
      where: { userId: req.userId, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
    });

    const actualAmounts: Record<string, number> = {};
    for (const item of latestRecord.assetItems) {
      const cat = allCategories.find(c => c.id === item.categoryId);
      if (cat && cat.isActive) {
        actualAmounts[item.categoryId] = Number(item.amount);
      }
    }

    const totalAsset = Number(latestRecord.total);
    const warningThreshold = Number(allocation.warningThreshold);

    const rebalance = computeRebalance(
      actualAmounts,
      targetPercentages,
      totalAsset,
      warningThreshold
    );

    const categoryMap = new Map(allCategories.map(c => [c.id, c]));

    const enrichedItems = rebalance.items.map(item => ({
      ...item,
      categoryName: categoryMap.get(item.categoryId)?.name ?? '未知类别',
      categoryColor: categoryMap.get(item.categoryId)?.color ?? '#909399'
    }));

    res.json({
      hasTarget: true,
      hasLatest: true,
      latestDate: latestRecord.date.toISOString().split('T')[0],
      rebalance: {
        ...rebalance,
        items: enrichedItems
      }
    });
  } catch (error) {
    console.error('Get rebalance error:', error);
    res.status(500).json({ error: '获取再平衡建议失败' });
  }
});

router.delete('/', authMiddleware, async (req: any, res) => {
  try {
    const allocation = await prisma.targetAllocation.findUnique({
      where: { userId: req.userId }
    });

    if (!allocation) {
      return res.status(404).json({ error: '目标配置不存在' });
    }

    await prisma.targetAllocation.delete({
      where: { userId: req.userId }
    });

    res.json({ message: '目标配置已删除' });
  } catch (error) {
    console.error('Delete target allocation error:', error);
    res.status(500).json({ error: '删除目标配置失败' });
  }
});

export default router;
