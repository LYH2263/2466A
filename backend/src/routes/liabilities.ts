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

const liabilitySchema = z.object({
  name: z.string().min(1, '名称不能为空').max(100, '名称最多100字'),
  amount: z.number().min(0, '金额不能为负数'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式必须为 YYYY-MM-DD'),
  note: z.string().max(200, '备注最多200字').optional()
});

router.get('/', authMiddleware, async (req: any, res) => {
  try {
    const records = await prisma.liabilityRecord.findMany({
      where: { userId: req.userId },
      orderBy: { date: 'desc' }
    });

    const formattedRecords = records.map(r => ({
      ...r,
      amount: Number(r.amount),
      date: r.date.toISOString().split('T')[0]
    }));

    const totalLiability = formattedRecords.length > 0
      ? formattedRecords.reduce((sum, r) => sum + r.amount, 0)
      : 0;

    res.json({
      records: formattedRecords,
      totalLiability
    });
  } catch (error) {
    console.error('Get liabilities error:', error);
    res.status(500).json({ error: '获取负债记录失败' });
  }
});

router.post('/', authMiddleware, async (req: any, res) => {
  try {
    const data = liabilitySchema.parse(req.body);

    const record = await prisma.liabilityRecord.create({
      data: {
        userId: req.userId,
        name: data.name,
        amount: data.amount,
        date: new Date(data.date),
        note: data.note
      }
    });

    res.status(201).json({
      message: '添加成功',
      record: {
        ...record,
        amount: Number(record.amount),
        date: record.date.toISOString().split('T')[0]
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Create liability error:', error);
    res.status(500).json({ error: '添加负债记录失败' });
  }
});

router.put('/:id', authMiddleware, async (req: any, res) => {
  try {
    const { id } = req.params;
    const data = liabilitySchema.parse(req.body);

    const existingRecord = await prisma.liabilityRecord.findFirst({
      where: { id, userId: req.userId }
    });

    if (!existingRecord) {
      return res.status(404).json({ error: '记录不存在或无权限编辑' });
    }

    const updatedRecord = await prisma.liabilityRecord.update({
      where: { id },
      data: {
        name: data.name,
        amount: data.amount,
        date: new Date(data.date),
        note: data.note
      }
    });

    res.json({
      message: '编辑成功',
      record: {
        ...updatedRecord,
        amount: Number(updatedRecord.amount),
        date: updatedRecord.date.toISOString().split('T')[0]
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Update liability error:', error);
    res.status(500).json({ error: '编辑负债记录失败' });
  }
});

router.delete('/:id', authMiddleware, async (req: any, res) => {
  try {
    const { id } = req.params;

    const record = await prisma.liabilityRecord.findFirst({
      where: { id, userId: req.userId }
    });

    if (!record) {
      return res.status(404).json({ error: '记录不存在或无权限删除' });
    }

    await prisma.liabilityRecord.delete({ where: { id } });

    res.json({ message: '删除成功' });
  } catch (error) {
    console.error('Delete liability error:', error);
    res.status(500).json({ error: '删除负债记录失败' });
  }
});

function formatDateKey(date: Date): string {
  return date.toISOString().split('T')[0];
}

function generateDateRange(startDate: Date, endDate: Date): string[] {
  const dates: string[] = [];
  const current = new Date(startDate);
  while (current <= endDate) {
    dates.push(formatDateKey(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

interface NetWorthTimePoint {
  date: string;
  totalAsset: number;
  totalLiability: number;
  netWorth: number;
  hasAsset: boolean;
  hasLiability: boolean;
}

function mergeAssetAndLiabilitySeries(
  assetRecords: any[],
  liabilityRecords: any[]
): NetWorthTimePoint[] {
  if (assetRecords.length === 0 && liabilityRecords.length === 0) {
    return [];
  }

  const assetMap = new Map<string, number>();
  const liabilityMap = new Map<string, number>();

  for (const r of assetRecords) {
    const key = formatDateKey(new Date(r.date));
    assetMap.set(key, Number(r.total));
  }

  const liabilityByDate = new Map<string, number>();
  for (const r of liabilityRecords) {
    const key = formatDateKey(new Date(r.date));
    const current = liabilityByDate.get(key) || 0;
    liabilityByDate.set(key, current + Number(r.amount));
  }

  for (const [date, total] of liabilityByDate) {
    liabilityMap.set(date, total);
  }

  const allDates = new Set<string>();
  for (const r of assetRecords) allDates.add(formatDateKey(new Date(r.date)));
  for (const r of liabilityRecords) allDates.add(formatDateKey(new Date(r.date)));

  if (allDates.size === 0) return [];

  const sortedDates = Array.from(allDates).sort();
  const startDate = new Date(sortedDates[0]);
  const endDate = new Date(sortedDates[sortedDates.length - 1]);
  const fullDateRange = generateDateRange(startDate, endDate);

  let lastAsset = 0;
  let lastLiability = 0;
  let hasAnyAsset = false;
  let hasAnyLiability = false;

  const result: NetWorthTimePoint[] = [];

  for (const date of fullDateRange) {
    const hasAssetNow = assetMap.has(date);
    const hasLiabilityNow = liabilityMap.has(date);

    if (hasAssetNow) {
      lastAsset = assetMap.get(date)!;
      hasAnyAsset = true;
    }
    if (hasLiabilityNow) {
      lastLiability = liabilityMap.get(date)!;
      hasAnyLiability = true;
    }

    result.push({
      date,
      totalAsset: lastAsset,
      totalLiability: lastLiability,
      netWorth: lastAsset - lastLiability,
      hasAsset: hasAnyAsset,
      hasLiability: hasAnyLiability
    });
  }

  return result;
}

function aggregateNetWorthByPeriod(
  series: NetWorthTimePoint[],
  granularity: 'day' | 'month' | 'quarter' | 'year' = 'day'
): NetWorthTimePoint[] {
  if (series.length === 0) return [];

  const getPeriodKey = (dateStr: string): string => {
    const d = new Date(dateStr);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const q = Math.floor((m - 1) / 3) + 1;
    switch (granularity) {
      case 'day': return dateStr;
      case 'month': return `${y}-${m.toString().padStart(2, '0')}`;
      case 'quarter': return `${y}-Q${q}`;
      case 'year': return `${y}`;
    }
  };

  const periodMap = new Map<string, NetWorthTimePoint[]>();
  for (const point of series) {
    const key = getPeriodKey(point.date);
    if (!periodMap.has(key)) periodMap.set(key, []);
    periodMap.get(key)!.push(point);
  }

  const result: NetWorthTimePoint[] = [];
  const sortedKeys = Array.from(periodMap.keys()).sort();

  for (const key of sortedKeys) {
    const points = periodMap.get(key)!;
    const lastPoint = points[points.length - 1];
    const firstPoint = points[0];

    result.push({
      date: key,
      totalAsset: lastPoint.totalAsset,
      totalLiability: lastPoint.totalLiability,
      netWorth: lastPoint.netWorth,
      hasAsset: lastPoint.hasAsset,
      hasLiability: lastPoint.hasLiability
    });
  }

  return result;
}

router.get('/net-worth', authMiddleware, async (req: any, res) => {
  try {
    const granularity = (req.query.granularity as string) || 'day';
    const validGranularities = ['day', 'month', 'quarter', 'year'];
    const g = validGranularities.includes(granularity) ? granularity as any : 'day';

    const [assetRecords, liabilityRecords] = await Promise.all([
      prisma.assetRecord.findMany({
        where: { userId: req.userId },
        orderBy: { date: 'asc' }
      }),
      prisma.liabilityRecord.findMany({
        where: { userId: req.userId },
        orderBy: { date: 'asc' }
      })
    ]);

    const merged = mergeAssetAndLiabilitySeries(assetRecords, liabilityRecords);
    const aggregated = aggregateNetWorthByPeriod(merged, g);

    let latest = null;
    if (aggregated.length > 0) {
      latest = aggregated[aggregated.length - 1];
    }

    let totalAsset = 0;
    let totalLiability = 0;

    if (assetRecords.length > 0) {
      const sortedAssets = [...assetRecords].sort((a, b) =>
        new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      totalAsset = Number(sortedAssets[0].total);
    }

    const liabByDate = new Map<string, number>();
    for (const r of liabilityRecords) {
      const key = formatDateKey(new Date(r.date));
      liabByDate.set(key, (liabByDate.get(key) || 0) + Number(r.amount));
    }
    if (liabByDate.size > 0) {
      const sortedLiabDates = Array.from(liabByDate.keys()).sort().reverse();
      totalLiability = liabByDate.get(sortedLiabDates[0]) || 0;
    }

    const netWorth = totalAsset - totalLiability;

    res.json({
      series: aggregated,
      summary: {
        latestDate: latest?.date || null,
        totalAsset,
        totalLiability,
        netWorth,
        isNegative: netWorth < 0,
        hasAssetData: assetRecords.length > 0,
        hasLiabilityData: liabilityRecords.length > 0
      }
    });
  } catch (error) {
    console.error('Net worth calculation error:', error);
    res.status(500).json({ error: '净资产计算失败' });
  }
});

export default router;
