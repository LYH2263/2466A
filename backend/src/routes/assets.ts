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

const categoryAmountSchema = z.object({
  categoryId: z.string(),
  amount: z.number().min(0, '金额不能为负数')
});

const assetSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式必须为 YYYY-MM-DD'),
  categoryAmounts: z.array(categoryAmountSchema).min(1, '至少输入一项资产金额'),
  note: z.string().max(100, '备注最多100字').optional()
}).refine((data) => {
  return data.categoryAmounts.some(ca => ca.amount > 0);
}, {
  message: '至少输入一项大于0的资产金额'
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

    const [records, allCategories] = await Promise.all([
      prisma.assetRecord.findMany({
        where: { userId: req.userId },
        include: {
          assetItems: true
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

      return {
        ...record,
        categoryAmounts,
        cash: legacyFields.cash,
        longTermInvest: legacyFields.longTermInvest,
        stableBond: legacyFields.stableBond,
        assetItems: undefined
      };
    });

    res.json({
      records: recordsWithCategoryAmounts,
      categories: allCategories
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

      return newRecord;
    });

    const categoryAmounts: any = {};
    for (const ca of data.categoryAmounts) {
      categoryAmounts[ca.categoryId] = ca.amount;
    }

    res.status(201).json({ 
      message: '添加成功',
      record: {
        ...record,
        categoryAmounts
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
      include: { assetItems: true }
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

    res.json({
      message: '编辑成功',
      record: {
        ...updatedRecord,
        categoryAmounts
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

export default router;
