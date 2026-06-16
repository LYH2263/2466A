import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import jwt from 'jsonwebtoken';
import { MAX_TAGS_PER_RECORD } from './tags.js';

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

const categoryAmountSchema = z.object({
  categoryId: z.string(),
  amount: z.number().min(0, '金额不能为负数')
});

const assetSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式必须为 YYYY-MM-DD'),
  categoryAmounts: z.array(categoryAmountSchema).min(1, '至少输入一项资产金额'),
  note: z.string().max(100, '备注最多100字').optional(),
  tagIds: z.array(z.string()).max(MAX_TAGS_PER_RECORD, `单条记录最多 ${MAX_TAGS_PER_RECORD} 个标签`).optional()
}).refine((data) => {
  return data.categoryAmounts.some(ca => ca.amount > 0);
}, {
  message: '至少输入一项大于0的资产金额'
}).refine((data) => {
  const uniqueTagIds = new Set(data.tagIds || []);
  return (data.tagIds?.length || 0) === uniqueTagIds.size;
}, {
  message: '标签不能重复',
  path: ['tagIds']
});

async function getActiveCategories(userId: string) {
  return await prisma.category.findMany({
    where: { userId, isActive: true, deletedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
  });
}

function buildLegacyFields(categoryAmounts: any[], categories: any[]) {
  const categoryMap = new Map(categories.map(c => [c.id, c.name]));
  let cash = 0, longTermInvest = 0, stableBond = 0;

  for (const ca of categoryAmounts) {
    const name = categoryMap.get(ca.categoryId);
    if (name === '活钱') cash = ca.amount;
    else if (name === '长期投资') longTermInvest = ca.amount;
    else if (name === '稳定债券') stableBond = ca.amount;
  }

  return { cash, longTermInvest, stableBond };
}

function buildCategoryMap(assetItems: any[], allCategories: any[]) {
  const categoryMap = new Map(allCategories.map(c => [c.id, c]));
  const result: any = {};

  for (const item of assetItems) {
    const category = categoryMap.get(item.categoryId);
    if (category) {
      result[category.id] = Number(item.amount);
    }
  }

  return result;
}

router.get('/', authMiddleware, async (req: any, res) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const tagFilter = req.query.tagId ? String(req.query.tagId) : null;

    const whereCondition: any = { userId: req.userId };
    
    if (tagFilter) {
      whereCondition.tagLinks = {
        some: { tagId: tagFilter }
      };
    }

    const [records, allCategories, allTags] = await Promise.all([
      prisma.assetRecord.findMany({
        where: whereCondition,
        include: {
          assetItems: true,
          tagLinks: {
            include: { tag: true }
          }
        },
        orderBy: { date: 'desc' }
      }),
      prisma.category.findMany({
        where: {
          userId: req.userId,
          deletedAt: null,
          ...(includeInactive ? {} : { isActive: true })
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
      }),
      prisma.tag.findMany({
        where: { userId: req.userId },
        orderBy: [{ createdAt: 'asc' }]
      })
    ]);

    const recordsWithCategoryAmounts = records.map(record => {
      const categoryAmounts = buildCategoryMap(record.assetItems, allCategories);
      const legacyFields = buildLegacyFields(
        record.assetItems.map((item: any) => ({
          categoryId: item.categoryId,
          amount: Number(item.amount)
        })),
        allCategories
      );

      const tags = record.tagLinks.map((tl: any) => ({
        id: tl.tag.id,
        name: tl.tag.name,
        color: tl.tag.color
      }));

      return {
        ...record,
        categoryAmounts,
        cash: legacyFields.cash,
        longTermInvest: legacyFields.longTermInvest,
        stableBond: legacyFields.stableBond,
        tags,
        assetItems: undefined,
        tagLinks: undefined
      };
    });

    res.json({
      records: recordsWithCategoryAmounts,
      categories: allCategories,
      tags: allTags
    });
  } catch (error) {
    console.error('Get assets error:', error);
    res.status(500).json({ error: '获取资产记录失败' });
  }
});

router.post('/', authMiddleware, async (req: any, res) => {
  try {
    const data = assetSchema.parse(req.body);

    const activeCategories = await getActiveCategories(req.userId);
    const activeCategoryIds = new Set(activeCategories.map(c => c.id));

    for (const ca of data.categoryAmounts) {
      if (!activeCategoryIds.has(ca.categoryId)) {
        return res.status(400).json({ error: '包含无效或已停用的类别' });
      }
    }

    if (data.tagIds && data.tagIds.length > 0) {
      const validTags = await prisma.tag.findMany({
        where: {
          userId: req.userId,
          id: { in: data.tagIds }
        },
        select: { id: true }
      });

      if (validTags.length !== data.tagIds.length) {
        return res.status(400).json({ error: '包含无效的标签' });
      }
    }

    const total = data.categoryAmounts.reduce((sum, ca) => sum + ca.amount, 0);
    const legacyFields = buildLegacyFields(data.categoryAmounts, activeCategories);

    const record = await prisma.$transaction(async (tx) => {
      const newRecord = await tx.assetRecord.create({
        data: {
          userId: req.userId,
          date: new Date(data.date),
          cash: legacyFields.cash,
          longTermInvest: legacyFields.longTermInvest,
          stableBond: legacyFields.stableBond,
          total,
          note: data.note
        }
      });

      await tx.assetItem.createMany({
        data: data.categoryAmounts
          .filter(ca => ca.amount > 0)
          .map(ca => ({
            assetRecordId: newRecord.id,
            categoryId: ca.categoryId,
            amount: ca.amount
          }))
      });

      if (data.tagIds && data.tagIds.length > 0) {
        await tx.assetRecordTag.createMany({
          data: data.tagIds.map(tagId => ({
            assetRecordId: newRecord.id,
            tagId
          }))
        });
      }

      return newRecord;
    });

    const categoryAmounts: any = {};
    for (const ca of data.categoryAmounts) {
      categoryAmounts[ca.categoryId] = ca.amount;
    }

    const tags = data.tagIds ? await prisma.tag.findMany({
      where: { id: { in: data.tagIds } },
      select: { id: true, name: true, color: true }
    }) : [];

    res.status(201).json({ 
      message: '添加成功',
      record: {
        ...record,
        categoryAmounts,
        tags
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Create asset error:', error);
    res.status(500).json({ error: '添加资产记录失败' });
  }
});

router.put('/:id', authMiddleware, async (req: any, res) => {
  try {
    const { id } = req.params;
    const data = assetSchema.parse(req.body);

    const existingRecord = await prisma.assetRecord.findFirst({
      where: { id, userId: req.userId },
      include: { assetItems: true, tagLinks: true }
    });

    if (!existingRecord) {
      return res.status(404).json({ error: '记录不存在或已被删除，无法编辑' });
    }

    const activeCategories = await getActiveCategories(req.userId);
    const activeCategoryIds = new Set(activeCategories.map(c => c.id));
    const allCategories = await prisma.category.findMany({
      where: { userId: req.userId, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
    });

    for (const ca of data.categoryAmounts) {
      if (!activeCategoryIds.has(ca.categoryId)) {
        return res.status(400).json({ error: '包含无效或已停用的类别' });
      }
    }

    if (data.tagIds && data.tagIds.length > 0) {
      const validTags = await prisma.tag.findMany({
        where: {
          userId: req.userId,
          id: { in: data.tagIds }
        },
        select: { id: true }
      });

      if (validTags.length !== data.tagIds.length) {
        return res.status(400).json({ error: '包含无效的标签' });
      }
    }

    const total = data.categoryAmounts.reduce((sum, ca) => sum + ca.amount, 0);
    const legacyFields = buildLegacyFields(data.categoryAmounts, allCategories);

    const previousItems = existingRecord.assetItems.map((item: any) => ({
      categoryId: item.categoryId,
      amount: Number(item.amount)
    }));
    const previousCategoryAmounts = buildCategoryMap(existingRecord.assetItems, allCategories);

    const snapshot = {
      date: existingRecord.date.toISOString().split('T')[0],
      categoryAmounts: previousCategoryAmounts,
      cash: Number(existingRecord.cash),
      longTermInvest: Number(existingRecord.longTermInvest),
      stableBond: Number(existingRecord.stableBond),
      total: Number(existingRecord.total),
      note: existingRecord.note || null,
      tagIds: existingRecord.tagLinks.map((tl: any) => tl.tagId),
      editedAt: new Date().toISOString()
    };

    const updatedRecord = await prisma.$transaction(async (tx) => {
      await tx.assetItem.deleteMany({
        where: { assetRecordId: id }
      });

      await tx.assetItem.createMany({
        data: data.categoryAmounts
          .filter(ca => ca.amount > 0)
          .map(ca => ({
            assetRecordId: id,
            categoryId: ca.categoryId,
            amount: ca.amount
          }))
      });

      await tx.assetRecordTag.deleteMany({
        where: { assetRecordId: id }
      });

      if (data.tagIds && data.tagIds.length > 0) {
        await tx.assetRecordTag.createMany({
          data: data.tagIds.map(tagId => ({
            assetRecordId: id,
            tagId
          }))
        });
      }

      return await tx.assetRecord.update({
        where: { id },
        data: {
          date: new Date(data.date),
          cash: legacyFields.cash,
          longTermInvest: legacyFields.longTermInvest,
          stableBond: legacyFields.stableBond,
          total,
          note: data.note,
          editCount: { increment: 1 },
          previousSnapshot: snapshot
        }
      });
    });

    const categoryAmounts: any = {};
    for (const ca of data.categoryAmounts) {
      categoryAmounts[ca.categoryId] = ca.amount;
    }

    const tags = data.tagIds ? await prisma.tag.findMany({
      where: { id: { in: data.tagIds } },
      select: { id: true, name: true, color: true }
    }) : [];

    res.json({
      message: '编辑成功',
      record: {
        ...updatedRecord,
        categoryAmounts,
        tags
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Update asset error:', error);
    res.status(500).json({ error: '编辑资产记录失败' });
  }
});

router.delete('/:id', authMiddleware, async (req: any, res) => {
  try {
    const { id } = req.params;

    const record = await prisma.assetRecord.findFirst({
      where: { id, userId: req.userId }
    });

    if (!record) {
      return res.status(404).json({ error: '记录不存在或无权限删除' });
    }

    await prisma.assetRecord.delete({ where: { id } });

    res.json({ message: '删除成功' });
  } catch (error) {
    console.error('Delete asset error:', error);
    res.status(500).json({ error: '删除资产记录失败' });
  }
});

function calcDiff(current: number, base: number) {
  const diff = current - base;
  const percent = base === 0 ? null : (diff / base) * 100;
  return { diff, percent };
}

function findClosestYoyRecord(records: any[], targetDate: Date) {
  if (records.length === 0) return null;
  const targetTime = targetDate.getTime();
  let closest: any = null;
  let minDiff = Infinity;
  for (const r of records) {
    const diff = Math.abs(new Date(r.date).getTime() - targetTime);
    if (diff < minDiff) {
      minDiff = diff;
      closest = r;
    }
  }
  const monthsDiff = Math.abs(
    (targetDate.getFullYear() - new Date(closest.date).getFullYear()) * 12 +
    (targetDate.getMonth() - new Date(closest.date).getMonth())
  );
  return monthsDiff <= 3 ? closest : null;
}

router.get('/trend', authMiddleware, async (req: any, res) => {
  try {
    const [allRecords, liabilityRecords] = await Promise.all([
      prisma.assetRecord.findMany({
        where: { userId: req.userId },
        include: { assetItems: true },
        orderBy: { date: 'asc' }
      }),
      prisma.liabilityRecord.findMany({
        where: { userId: req.userId },
        orderBy: { date: 'asc' }
      })
    ]);

    if (allRecords.length === 0) {
      return res.json({
        latestDate: null,
        categories: [],
        total: { amount: 0, mom: { diff: 0, percent: null, hasBase: false }, yoy: { diff: 0, percent: null, hasBase: false } },
        totalLiability: { amount: 0, mom: { diff: 0, percent: null, hasBase: false }, yoy: { diff: 0, percent: null, hasBase: false } },
        netWorth: { amount: 0, mom: { diff: 0, percent: null, hasBase: false }, yoy: { diff: 0, percent: null, hasBase: false } },
        hasSufficientData: { mom: false, yoy: false }
      });
    }

    const allCategories = await prisma.category.findMany({
      where: { userId: req.userId, deletedAt: null, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
    });

    const latest = allRecords[allRecords.length - 1];
    const latestDate = new Date(latest.date);
    const yoyTargetDate = new Date(latestDate.getFullYear() - 1, latestDate.getMonth(), latestDate.getDate());

    const previous = allRecords.length >= 2 ? allRecords[allRecords.length - 2] : null;
    const yoyRecord = findClosestYoyRecord(allRecords.slice(0, -1), yoyTargetDate);

    const latestCatMap = buildCategoryMap(latest.assetItems, allCategories);
    const prevCatMap = previous ? buildCategoryMap(previous.assetItems, allCategories) : {};
    const yoyCatMap = yoyRecord ? buildCategoryMap(yoyRecord.assetItems, allCategories) : {};

    const latestTotal = Number(latest.total);
    const prevTotal = previous ? Number(previous.total) : 0;
    const yoyTotal = yoyRecord ? Number(yoyRecord.total) : 0;

    const momCalc = previous ? calcDiff(latestTotal, prevTotal) : { diff: 0, percent: null };
    const yoyCalc = yoyRecord ? calcDiff(latestTotal, yoyTotal) : { diff: 0, percent: null };

    const categories = allCategories.map(cat => {
      const amount = latestCatMap[cat.id] ?? 0;
      const prevAmount = prevCatMap[cat.id] ?? 0;
      const yoyAmount = yoyCatMap[cat.id] ?? 0;

      const momCat = previous ? calcDiff(amount, prevAmount) : { diff: 0, percent: null };
      const yoyCat = yoyRecord ? calcDiff(amount, yoyAmount) : { diff: 0, percent: null };

      return {
        categoryId: cat.id,
        amount,
        percentageInTotal: latestTotal === 0 ? 0 : (amount / latestTotal) * 100,
        mom: {
          diff: momCat.diff,
          percent: momCat.percent,
          hasBase: !!previous,
          compareDate: previous ? previous.date.toISOString().split('T')[0] : undefined
        },
        yoy: {
          diff: yoyCat.diff,
          percent: yoyCat.percent,
          hasBase: !!yoyRecord,
          compareDate: yoyRecord ? yoyRecord.date.toISOString().split('T')[0] : undefined
        }
      };
    });

    const getLiabilityAtDate = (targetDate: Date): number => {
      const targetTime = targetDate.getTime();
      let total = 0;
      const seenNames = new Map<string, { amount: number; date: Date }>();
      
      for (const lr of liabilityRecords) {
        const lrDate = new Date(lr.date);
        if (lrDate.getTime() <= targetTime) {
          const existing = seenNames.get(lr.name);
          if (!existing || lrDate.getTime() > existing.date.getTime()) {
            seenNames.set(lr.name, { amount: Number(lr.amount), date: lrDate });
          }
        }
      }
      
      for (const { amount } of seenNames.values()) {
        total += amount;
      }
      return total;
    };

    const latestLiability = getLiabilityAtDate(latestDate);
    const prevLiability = previous ? getLiabilityAtDate(new Date(previous.date)) : 0;
    const yoyLiability = yoyRecord ? getLiabilityAtDate(new Date(yoyRecord.date)) : 0;

    const momLiabilityCalc = previous ? calcDiff(latestLiability, prevLiability) : { diff: 0, percent: null };
    const yoyLiabilityCalc = yoyRecord ? calcDiff(latestLiability, yoyLiability) : { diff: 0, percent: null };

    const latestNetWorth = latestTotal - latestLiability;
    const prevNetWorth = previous ? prevTotal - prevLiability : 0;
    const yoyNetWorth = yoyRecord ? yoyTotal - yoyLiability : 0;

    const momNetWorthCalc = previous ? calcDiff(latestNetWorth, prevNetWorth) : { diff: 0, percent: null };
    const yoyNetWorthCalc = yoyRecord ? calcDiff(latestNetWorth, yoyNetWorth) : { diff: 0, percent: null };

    res.json({
      latestDate: latest.date.toISOString().split('T')[0],
      categories,
      total: {
        amount: latestTotal,
        mom: {
          diff: momCalc.diff,
          percent: momCalc.percent,
          hasBase: !!previous,
          compareDate: previous ? previous.date.toISOString().split('T')[0] : undefined
        },
        yoy: {
          diff: yoyCalc.diff,
          percent: yoyCalc.percent,
          hasBase: !!yoyRecord,
          compareDate: yoyRecord ? yoyRecord.date.toISOString().split('T')[0] : undefined
        }
      },
      totalLiability: {
        amount: latestLiability,
        mom: {
          diff: momLiabilityCalc.diff,
          percent: momLiabilityCalc.percent,
          hasBase: !!previous,
          compareDate: previous ? previous.date.toISOString().split('T')[0] : undefined
        },
        yoy: {
          diff: yoyLiabilityCalc.diff,
          percent: yoyLiabilityCalc.percent,
          hasBase: !!yoyRecord,
          compareDate: yoyRecord ? yoyRecord.date.toISOString().split('T')[0] : undefined
        }
      },
      netWorth: {
        amount: latestNetWorth,
        mom: {
          diff: momNetWorthCalc.diff,
          percent: momNetWorthCalc.percent,
          hasBase: !!previous,
          compareDate: previous ? previous.date.toISOString().split('T')[0] : undefined
        },
        yoy: {
          diff: yoyNetWorthCalc.diff,
          percent: yoyNetWorthCalc.percent,
          hasBase: !!yoyRecord,
          compareDate: yoyRecord ? yoyRecord.date.toISOString().split('T')[0] : undefined
        }
      },
      hasSufficientData: {
        mom: !!previous,
        yoy: !!yoyRecord
      }
    });
  } catch (error) {
    console.error('Trend analysis error:', error);
    res.status(500).json({ error: '趋势分析计算失败' });
  }
});

const rangeSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
}).refine(data => new Date(data.startDate) <= new Date(data.endDate), {
  message: '开始日期不能晚于结束日期',
  path: ['startDate']
});

function calcMaxDrawdown(records: any[]) {
  if (records.length < 2) {
    return { value: 0, percent: null, peakDate: '', troughDate: '', hasData: false };
  }
  let peak = Number(records[0].total);
  let peakDate = records[0].date.toISOString().split('T')[0];
  let maxDD = 0;
  let maxDDPercent: number | null = null;
  let troughDate = peakDate;
  let currentPeak = peak;
  let currentPeakDate = peakDate;

  for (let i = 1; i < records.length; i++) {
    const total = Number(records[i].total);
    const dateStr = records[i].date.toISOString().split('T')[0];
    if (total > currentPeak) {
      currentPeak = total;
      currentPeakDate = dateStr;
    }
    const dd = currentPeak - total;
    const ddPercent = currentPeak === 0 ? null : (dd / currentPeak) * 100;
    if (dd > maxDD) {
      maxDD = dd;
      maxDDPercent = ddPercent;
      peakDate = currentPeakDate;
      troughDate = dateStr;
      peak = currentPeak;
    }
  }
  return { value: maxDD, percent: maxDDPercent, peakDate, troughDate, hasData: true };
}

function calcAvgMonthlyGrowth(records: any[]) {
  if (records.length < 2) return { rate: null, monthlyCount: 0 };
  const sorted = [...records].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const firstDate = new Date(first.date);
  const lastDate = new Date(last.date);
  const monthDiff = (lastDate.getFullYear() - firstDate.getFullYear()) * 12 + (lastDate.getMonth() - firstDate.getMonth());
  if (monthDiff === 0) return { rate: null, monthlyCount: 0 };
  const firstTotal = Number(first.total);
  const lastTotal = Number(last.total);
  if (firstTotal === 0) return { rate: null, monthlyCount: monthDiff };
  const totalGrowthRate = (lastTotal - firstTotal) / firstTotal;
  const avgMonthly = totalGrowthRate / monthDiff * 100;
  return { rate: avgMonthly, monthlyCount: monthDiff };
}

router.get('/range-analysis', authMiddleware, async (req: any, res) => {
  try {
    const { startDate, endDate } = rangeSchema.parse(req.query);
    const start = new Date(startDate);
    const end = new Date(endDate);

    const allRecords = await prisma.assetRecord.findMany({
      where: { userId: req.userId },
      include: { assetItems: true },
      orderBy: { date: 'asc' }
    });

    if (allRecords.length === 0) {
      return res.json({
        startDate, endDate,
        startTotal: 0, endTotal: 0, netGrowth: 0, netGrowthPercent: null,
        categoryContributions: [],
        maxDrawdown: { value: 0, percent: null, peakDate: '', troughDate: '', hasData: false },
        avgMonthlyGrowthRate: null, monthlyCount: 0, hasSufficientData: false
      });
    }

    const allCategories = await prisma.category.findMany({
      where: { userId: req.userId, deletedAt: null, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
    });

    const findBoundaryRecord = (targetDate: Date, direction: 'before' | 'after') => {
      const targetTime = targetDate.getTime();
      let best: any = null;
      let bestDiff = Infinity;
      for (const r of allRecords) {
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
        best = direction === 'before' ? allRecords[allRecords.length - 1] : allRecords[0];
      }
      return best;
    };

    const startRecord = findBoundaryRecord(start, 'before');
    const endRecord = findBoundaryRecord(end, 'after');

    if (!startRecord || !endRecord) {
      return res.json({
        startDate, endDate,
        startTotal: 0, endTotal: 0, netGrowth: 0, netGrowthPercent: null,
        categoryContributions: [],
        maxDrawdown: { value: 0, percent: null, peakDate: '', troughDate: '', hasData: false },
        avgMonthlyGrowthRate: null, monthlyCount: 0, hasSufficientData: false
      });
    }

    const rangeRecords = allRecords.filter(r => {
      const t = new Date(r.date).getTime();
      return t >= new Date(startRecord.date).getTime() && t <= new Date(endRecord.date).getTime();
    });

    const startCatMap = buildCategoryMap(startRecord.assetItems, allCategories);
    const endCatMap = buildCategoryMap(endRecord.assetItems, allCategories);

    const startTotal = Number(startRecord.total);
    const endTotal = Number(endRecord.total);
    const netGrowth = endTotal - startTotal;
    const netGrowthPercent = startTotal === 0 ? null : (netGrowth / startTotal) * 100;

    const categoryContributions = allCategories.map(cat => {
      const startAmt = startCatMap[cat.id] ?? 0;
      const endAmt = endCatMap[cat.id] ?? 0;
      const diff = endAmt - startAmt;
      const startPct = startTotal === 0 ? 0 : (startAmt / startTotal) * 100;
      const endPct = endTotal === 0 ? 0 : (endAmt / endTotal) * 100;
      const contribPct = Math.abs(netGrowth) < 0.0001 ? null : (diff / Math.abs(netGrowth)) * 100 * Math.sign(netGrowth || 1);
      return {
        categoryId: cat.id,
        startAmount: startAmt,
        endAmount: endAmt,
        diff,
        contributionPercent: contribPct,
        percentageChange: { start: startPct, end: endPct, diff: endPct - startPct }
      };
    });

    const maxDD = calcMaxDrawdown(rangeRecords);
    const monthlyResult = calcAvgMonthlyGrowth(rangeRecords);

    res.json({
      startDate: startRecord.date.toISOString().split('T')[0],
      endDate: endRecord.date.toISOString().split('T')[0],
      startTotal, endTotal, netGrowth, netGrowthPercent,
      categoryContributions,
      maxDrawdown: maxDD,
      avgMonthlyGrowthRate: monthlyResult.rate,
      monthlyCount: monthlyResult.monthlyCount,
      hasSufficientData: rangeRecords.length >= 2
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Range analysis error:', error);
    res.status(500).json({ error: '区间分析计算失败' });
  }
});

export default router;
