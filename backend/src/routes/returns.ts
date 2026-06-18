import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import jwt from 'jsonwebtoken';
import type { AssetRecord, CashFlow, Category, AssetItem } from '@prisma/client';

interface AssetRecordWithItems extends AssetRecord {
  assetItems: AssetItem[];
}

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

async function getDisplayCategories(userId: string, records: any[] = []) {
  const activeCategories = await prisma.category.findMany({
    where: { userId, isActive: true, deletedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
  });

  if (records.length === 0) {
    return activeCategories;
  }

  const usedCategoryIds = new Set<string>();
  for (const record of records) {
    for (const item of record.assetItems || []) {
      usedCategoryIds.add(item.categoryId);
    }
  }

  const activeIds = new Set(activeCategories.map(c => c.id));
  const usedInactiveIds = Array.from(usedCategoryIds).filter(id => !activeIds.has(id));

  if (usedInactiveIds.length === 0) {
    return activeCategories;
  }

  const usedInactiveCategories = await prisma.category.findMany({
    where: {
      userId,
      deletedAt: null,
      id: { in: usedInactiveIds },
      isActive: false
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
  });

  return [...activeCategories, ...usedInactiveCategories].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

const returnsQuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式必须为 YYYY-MM-DD'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式必须为 YYYY-MM-DD')
}).refine(data => new Date(data.startDate) <= new Date(data.endDate), {
  message: '开始日期不能晚于结束日期',
  path: ['startDate']
});

function calcDaysBetween(startDate: Date, endDate: Date): number {
  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  return Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);
}

function calcSimpleReturn(startValue: number, endValue: number): { absolute: number; percent: number | null } {
  const absolute = endValue - startValue;
  const percent = Math.abs(startValue) < 0.0001 ? null : (absolute / Math.abs(startValue)) * 100;
  return { absolute, percent };
}

function calcAnnualizedReturn(cumulativeReturnPercent: number | null, days: number): number | null {
  if (cumulativeReturnPercent === null || days < 1) return null;
  const cumulativeReturn = cumulativeReturnPercent / 100;
  const annualized = (Math.pow(1 + cumulativeReturn, 365 / days) - 1) * 100;
  return annualized;
}

interface CategoryAmountMap {
  [categoryId: string]: number;
}

function buildCategoryMap(assetItems: any[], allCategories: Category[]): CategoryAmountMap {
  const categoryMap = new Map(allCategories.map((c: Category) => [c.id, c]));
  const result: CategoryAmountMap = {};
  for (const item of assetItems) {
    const category = categoryMap.get(item.categoryId);
    if (category) {
      result[category.id] = Number(item.amount);
    }
  }
  return result;
}

function findBoundaryRecord(records: AssetRecordWithItems[], targetDate: Date, direction: 'before' | 'after'): AssetRecordWithItems | null {
  if (records.length === 0) return null;
  const targetTime = targetDate.getTime();
  let best: AssetRecordWithItems | null = null;
  let bestDiff = Infinity;
  for (const r of records) {
    const rTime = new Date(r.date).getTime();
    if (direction === 'before' && rTime <= targetTime) {
      const diff = targetTime - rTime;
      if (diff < bestDiff) { bestDiff = diff; best = r; }
    } else if (direction === 'after' && rTime >= targetTime) {
      const diff = rTime - targetTime;
      if (diff < bestDiff) { bestDiff = diff; best = r; }
    }
  }
  if (!best) {
    best = direction === 'before' ? records[records.length - 1] : records[0];
  }
  return best;
}

interface SubPeriod {
  startRecord: AssetRecordWithItems;
  endRecord: AssetRecordWithItems;
  cashFlow: number;
  startCatMap: CategoryAmountMap;
  endCatMap: CategoryAmountMap;
}

function buildSubPeriods(
  rangeRecords: AssetRecordWithItems[],
  rangeCashFlows: CashFlow[],
  allCategories: Category[]
): SubPeriod[] {
  const criticalDates: { date: Date; cashFlow: number; isRecord: boolean; record?: AssetRecordWithItems }[] = [];

  for (const r of rangeRecords) {
    criticalDates.push({
      date: new Date(r.date),
      cashFlow: 0,
      isRecord: true,
      record: r
    });
  }

  const cashFlowByDate = new Map<string, number>();
  for (const cf of rangeCashFlows) {
    const dateKey = new Date(cf.date).toISOString().split('T')[0];
    const current = cashFlowByDate.get(dateKey) || 0;
    cashFlowByDate.set(dateKey, current + Number(cf.amount));
  }

  for (const [dateKey, amount] of cashFlowByDate.entries()) {
    const existingIdx = criticalDates.findIndex(
      d => new Date(d.date).toISOString().split('T')[0] === dateKey
    );
    if (existingIdx >= 0) {
      criticalDates[existingIdx].cashFlow += amount;
    } else {
      criticalDates.push({
        date: new Date(dateKey),
        cashFlow: amount,
        isRecord: false
      });
    }
  }

  criticalDates.sort((a, b) => a.date.getTime() - b.date.getTime());

  const subPeriods: SubPeriod[] = [];
  for (let i = 0; i < criticalDates.length - 1; i++) {
    const startPoint = criticalDates[i];
    const endPoint = criticalDates[i + 1];

    const startRecord = startPoint.isRecord
      ? startPoint.record!
      : findBoundaryRecord(rangeRecords, startPoint.date, 'before');
    const endRecord = endPoint.isRecord
      ? endPoint.record!
      : findBoundaryRecord(rangeRecords, endPoint.date, 'before');

    if (!startRecord || !endRecord) continue;

    subPeriods.push({
      startRecord,
      endRecord,
      cashFlow: endPoint.cashFlow,
      startCatMap: buildCategoryMap(startRecord.assetItems, allCategories),
      endCatMap: buildCategoryMap(endRecord.assetItems, allCategories)
    });
  }

  return subPeriods;
}

function calcTimeWeightedReturn(
  subPeriods: SubPeriod[]
): { percent: number | null; absoluteEstimate: number } {
  if (subPeriods.length === 0) return { percent: null, absoluteEstimate: 0 };

  let cumulativeFactor = 1;
  let hasValidPeriod = false;
  let totalAbsoluteEstimate = 0;

  for (const sp of subPeriods) {
    const startValue = Number(sp.startRecord.total);
    const endValue = Number(sp.endRecord.total);

    if (Math.abs(startValue) < 0.0001) continue;

    const periodReturn = (endValue - startValue - sp.cashFlow) / Math.abs(startValue);
    cumulativeFactor *= (1 + periodReturn);
    totalAbsoluteEstimate += startValue * periodReturn;
    hasValidPeriod = true;
  }

  if (!hasValidPeriod) return { percent: null, absoluteEstimate: 0 };
  return { percent: (cumulativeFactor - 1) * 100, absoluteEstimate: totalAbsoluteEstimate };
}

function calcCategoryTimeWeightedReturn(
  subPeriods: SubPeriod[],
  categoryId: string
): number | null {
  if (subPeriods.length === 0) return null;

  let cumulativeFactor = 1;
  let hasValidPeriod = false;

  for (const sp of subPeriods) {
    const startValue = sp.startCatMap[categoryId] ?? 0;
    const endValue = sp.endCatMap[categoryId] ?? 0;

    if (Math.abs(startValue) < 0.0001) continue;

    const periodReturn = (endValue - startValue) / Math.abs(startValue);
    cumulativeFactor *= (1 + periodReturn);
    hasValidPeriod = true;
  }

  if (!hasValidPeriod) return null;
  return (cumulativeFactor - 1) * 100;
}

interface CumulativePoint {
  date: string;
  total: number;
  cumulativeSimpleReturn: number | null;
  cumulativeTimeWeightedReturn: number | null;
}

function calcCumulativeCurve(
  rangeRecords: AssetRecordWithItems[],
  rangeCashFlows: CashFlow[],
  startTotal: number
): CumulativePoint[] {
  if (rangeRecords.length === 0 || startTotal === 0) return [];

  const sortedRecords = [...rangeRecords].sort(
    (a: AssetRecordWithItems, b: AssetRecordWithItems) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const cashFlowByDate = new Map<string, number>();
  for (const cf of rangeCashFlows) {
    const dateKey = new Date(cf.date).toISOString().split('T')[0];
    const current = cashFlowByDate.get(dateKey) || 0;
    cashFlowByDate.set(dateKey, current + Number(cf.amount));
  }

  const points: CumulativePoint[] = [];
  let twrFactor = 1;
  let previousTotal = startTotal;
  let firstPoint = true;

  for (const record of sortedRecords) {
    const currentTotal = Number(record.total);
    const dateKey = record.date.toISOString().split('T')[0];
    const periodCashFlow = cashFlowByDate.get(dateKey) || 0;

    const simpleReturn = ((currentTotal - startTotal) / Math.abs(startTotal)) * 100;

    let twrReturn: number | null = null;
    if (!firstPoint && Math.abs(previousTotal) >= 0.0001) {
      const periodReturn = (currentTotal - previousTotal - periodCashFlow) / Math.abs(previousTotal);
      twrFactor *= (1 + periodReturn);
      twrReturn = (twrFactor - 1) * 100;
    } else if (firstPoint) {
      twrReturn = 0;
    }

    points.push({
      date: dateKey,
      total: currentTotal,
      cumulativeSimpleReturn: firstPoint ? 0 : simpleReturn,
      cumulativeTimeWeightedReturn: twrReturn
    });

    previousTotal = currentTotal;
    firstPoint = false;
  }

  return points;
}

router.get('/', authMiddleware, async (req: any, res: any) => {
  try {
    const { startDate, endDate } = returnsQuerySchema.parse(req.query);
    const start = new Date(startDate);
    const end = new Date(endDate);

    const [allRecords, allCashFlows]: [AssetRecordWithItems[], CashFlow[]] = await Promise.all([
      prisma.assetRecord.findMany({
        where: { userId: req.userId },
        include: { assetItems: true },
        orderBy: { date: 'asc' }
      }) as Promise<AssetRecordWithItems[]>,
      prisma.cashFlow.findMany({
        where: { userId: req.userId },
        orderBy: { date: 'asc' }
      }) as Promise<CashFlow[]>
    ]);

    const allCategories = await getDisplayCategories(req.userId, allRecords);

    const emptyResponse = {
      startDate,
      endDate,
      actualDays: 0,
      hasSufficientData: false,
      warnings: [] as string[],
      total: {
        startValue: 0,
        endValue: 0,
        absoluteReturn: 0,
        simpleReturn: null as number | null,
        timeWeightedReturn: null as number | null,
        annualizedSimpleReturn: null as number | null,
        annualizedTimeWeightedReturn: null as number | null
      },
      cashFlowSummary: {
        totalDeposit: 0,
        totalWithdraw: 0,
        netCashFlow: 0,
        count: 0
      },
      categoryReturns: [] as any[],
      cumulativeCurve: [] as CumulativePoint[]
    };

    if (allRecords.length === 0) {
      emptyResponse.warnings = ['暂无资产记录数据'];
      return res.json(emptyResponse);
    }

    const startRecord = findBoundaryRecord(allRecords, start, 'before');
    const endRecord = findBoundaryRecord(allRecords, end, 'after');

    if (!startRecord || !endRecord) {
      emptyResponse.warnings = ['无法找到有效的边界记录'];
      return res.json(emptyResponse);
    }

    const warnings: string[] = [];
    const startRecordTime = new Date(startRecord.date).getTime();
    const endRecordTime = new Date(endRecord.date).getTime();
    const startDiff = Math.abs(start.getTime() - startRecordTime) / (1000 * 60 * 60 * 24);
    const endDiff = Math.abs(end.getTime() - endRecordTime) / (1000 * 60 * 60 * 24);

    if (startDiff > 7) warnings.push(`起始记录日期(${startRecord.date.toISOString().split('T')[0]})与查询起始日偏差${startDiff.toFixed(0)}天`);
    if (endDiff > 7) warnings.push(`结束记录日期(${endRecord.date.toISOString().split('T')[0]})与查询结束日偏差${endDiff.toFixed(0)}天`);

    const rangeRecords = allRecords.filter((r: AssetRecordWithItems) => {
      const t = new Date(r.date).getTime();
      return t >= startRecordTime && t <= endRecordTime;
    });

    const rangeCashFlows = allCashFlows.filter((cf: CashFlow) => {
      const t = new Date(cf.date).getTime();
      return t >= startRecordTime && t <= endRecordTime;
    });

    const actualStartDate = new Date(startRecord.date);
    const actualEndDate = new Date(endRecord.date);
    const actualDays = calcDaysBetween(actualStartDate, actualEndDate);

    if (actualDays < 1) {
      warnings.push('区间不足1天，年化收益率不可用');
    }
    if (rangeRecords.length < 2) {
      warnings.push('区间内记录数量不足，时间加权收益率可能不准确');
    }

    const startTotal = Number(startRecord.total);
    const endTotal = Number(endRecord.total);
    const startCatMap = buildCategoryMap(startRecord.assetItems, allCategories);
    const endCatMap = buildCategoryMap(endRecord.assetItems, allCategories);

    const totalDeposit = rangeCashFlows
      .filter((cf: CashFlow) => Number(cf.amount) > 0)
      .reduce((sum: number, cf: CashFlow) => sum + Number(cf.amount), 0);
    const totalWithdraw = rangeCashFlows
      .filter((cf: CashFlow) => Number(cf.amount) < 0)
      .reduce((sum: number, cf: CashFlow) => sum + Number(cf.amount), 0);
    const netCashFlow = totalDeposit + totalWithdraw;

    if (Math.abs(netCashFlow) > Math.abs(startTotal) * 0.5 && startTotal > 0) {
      warnings.push(`区间资金净流入(${netCashFlow > 0 ? '+' : ''}${netCashFlow.toFixed(2)})占期初资产${(Math.abs(netCashFlow) / Math.abs(startTotal) * 100).toFixed(1)}%，简单收益率可能失真，建议参考时间加权收益率`);
    }

    const simpleReturn = calcSimpleReturn(startTotal, endTotal);

    const subPeriods = buildSubPeriods(rangeRecords, rangeCashFlows, allCategories);
    const twrResult = calcTimeWeightedReturn(subPeriods);

    const annualizedSimple = calcAnnualizedReturn(simpleReturn.percent, actualDays);
    const annualizedTWR = calcAnnualizedReturn(twrResult.percent, actualDays);

    const categoryReturns = allCategories.map((cat: Category) => {
      const startAmt = startCatMap[cat.id] ?? 0;
      const endAmt = endCatMap[cat.id] ?? 0;
      const catSimple = calcSimpleReturn(startAmt, endAmt);
      const catTWR = calcCategoryTimeWeightedReturn(subPeriods, cat.id);
      const catAnnualizedSimple = calcAnnualizedReturn(catSimple.percent, actualDays);
      const catAnnualizedTWR = calcAnnualizedReturn(catTWR, actualDays);

      return {
        categoryId: cat.id,
        categoryName: cat.name,
        categoryColor: cat.color,
        startValue: startAmt,
        endValue: endAmt,
        absoluteReturn: catSimple.absolute,
        simpleReturn: catSimple.percent,
        timeWeightedReturn: catTWR,
        annualizedSimpleReturn: catAnnualizedSimple,
        annualizedTimeWeightedReturn: catAnnualizedTWR,
        percentageInTotal: startTotal === 0 ? 0 : (startAmt / startTotal) * 100
      };
    });

    const cumulativeCurve = calcCumulativeCurve(rangeRecords, rangeCashFlows, startTotal);

    res.json({
      startDate: startRecord.date.toISOString().split('T')[0],
      endDate: endRecord.date.toISOString().split('T')[0],
      actualDays,
      hasSufficientData: rangeRecords.length >= 2 && actualDays >= 1,
      warnings,
      total: {
        startValue: startTotal,
        endValue: endTotal,
        absoluteReturn: simpleReturn.absolute,
        simpleReturn: simpleReturn.percent,
        timeWeightedReturn: twrResult.percent,
        annualizedSimpleReturn: annualizedSimple,
        annualizedTimeWeightedReturn: annualizedTWR
      },
      cashFlowSummary: {
        totalDeposit,
        totalWithdraw,
        netCashFlow,
        count: rangeCashFlows.length
      },
      categoryReturns,
      cumulativeCurve
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Returns analysis error:', error);
    res.status(500).json({ error: '收益分析计算失败' });
  }
});

export default router;
