import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import jwt from 'jsonwebtoken';
import type { CashFlow } from '@prisma/client';

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

const cashFlowTypeEnum = z.enum(['deposit', 'withdraw', 'transfer_in', 'transfer_out', 'dividend', 'interest', 'other']);

const cashFlowSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式必须为 YYYY-MM-DD'),
  amount: z.number(),
  type: cashFlowTypeEnum,
  note: z.string().max(200, '备注最多200字').optional(),
  assetRecordId: z.string().optional()
}).refine((data) => data.amount !== 0, {
  message: '金额不能为0',
  path: ['amount']
});

router.get('/', authMiddleware, async (req: any, res: any) => {
  try {
    const { startDate, endDate, type } = req.query;
    const whereCondition: any = { userId: req.userId };

    if (startDate) {
      whereCondition.date = { ...whereCondition.date, gte: new Date(String(startDate)) };
    }
    if (endDate) {
      whereCondition.date = { ...whereCondition.date, lte: new Date(String(endDate)) };
    }
    if (type) {
      whereCondition.type = String(type);
    }

    const cashFlows: CashFlow[] = await prisma.cashFlow.findMany({
      where: whereCondition,
      orderBy: { date: 'desc' }
    });

    const totalDeposit = cashFlows
      .filter((cf: CashFlow) => Number(cf.amount) > 0)
      .reduce((sum: number, cf: CashFlow) => sum + Number(cf.amount), 0);
    const totalWithdraw = cashFlows
      .filter((cf: CashFlow) => Number(cf.amount) < 0)
      .reduce((sum: number, cf: CashFlow) => sum + Number(cf.amount), 0);

    res.json({
      cashFlows: cashFlows.map((cf: CashFlow) => ({
        ...cf,
        date: cf.date.toISOString().split('T')[0],
        amount: Number(cf.amount)
      })),
      summary: {
        totalDeposit,
        totalWithdraw,
        netCashFlow: totalDeposit + totalWithdraw,
        count: cashFlows.length
      }
    });
  } catch (error) {
    console.error('Get cash flows error:', error);
    res.status(500).json({ error: '获取资金流记录失败' });
  }
});

router.post('/', authMiddleware, async (req: any, res: any) => {
  try {
    const data = cashFlowSchema.parse(req.body);

    if (data.assetRecordId) {
      const record = await prisma.assetRecord.findFirst({
        where: { id: data.assetRecordId, userId: req.userId }
      });
      if (!record) {
        return res.status(400).json({ error: '关联的资产记录不存在' });
      }
    }

    const cashFlow: CashFlow = await prisma.cashFlow.create({
      data: {
        userId: req.userId,
        date: new Date(data.date),
        amount: data.amount,
        type: data.type,
        note: data.note,
        assetRecordId: data.assetRecordId
      }
    });

    res.status(201).json({
      message: '添加成功',
      cashFlow: {
        ...cashFlow,
        date: cashFlow.date.toISOString().split('T')[0],
        amount: Number(cashFlow.amount)
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Create cash flow error:', error);
    res.status(500).json({ error: '添加资金流记录失败' });
  }
});

router.put('/:id', authMiddleware, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const data = cashFlowSchema.parse(req.body);

    const existing = await prisma.cashFlow.findFirst({
      where: { id, userId: req.userId }
    });
    if (!existing) {
      return res.status(404).json({ error: '记录不存在' });
    }

    if (data.assetRecordId) {
      const record = await prisma.assetRecord.findFirst({
        where: { id: data.assetRecordId, userId: req.userId }
      });
      if (!record) {
        return res.status(400).json({ error: '关联的资产记录不存在' });
      }
    }

    const cashFlow: CashFlow = await prisma.cashFlow.update({
      where: { id },
      data: {
        date: new Date(data.date),
        amount: data.amount,
        type: data.type,
        note: data.note,
        assetRecordId: data.assetRecordId
      }
    });

    res.json({
      message: '更新成功',
      cashFlow: {
        ...cashFlow,
        date: cashFlow.date.toISOString().split('T')[0],
        amount: Number(cashFlow.amount)
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Update cash flow error:', error);
    res.status(500).json({ error: '更新资金流记录失败' });
  }
});

router.delete('/:id', authMiddleware, async (req: any, res: any) => {
  try {
    const { id } = req.params;

    const existing = await prisma.cashFlow.findFirst({
      where: { id, userId: req.userId }
    });
    if (!existing) {
      return res.status(404).json({ error: '记录不存在' });
    }

    await prisma.cashFlow.delete({ where: { id } });

    res.json({ message: '删除成功' });
  } catch (error) {
    console.error('Delete cash flow error:', error);
    res.status(500).json({ error: '删除资金流记录失败' });
  }
});

export default router;
