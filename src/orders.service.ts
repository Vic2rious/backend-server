import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { Prisma, orders } from '@prisma/client';

@Injectable()
export class OrdersService {
  constructor(private prisma: PrismaService) {}

  // Get one order by ID
  async getOrderById(id: number): Promise<orders | null> {
    if (isNaN(Number(id))) {
      throw new BadRequestException('Invalid ID format.');
    }
    const order = await this.prisma.orders.findUnique({
      where: { id },
      include: {
        order_products: true, // Include related order_products
      },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return order;
  }

  // Get all orders
  async getAllOrders(): Promise<orders[]> {
    return this.prisma.orders.findMany({
      include: {
        order_products: true, // Include related order_products
      },
    });
  }

  // Create a new order
  async createOrder(
    data: Prisma.ordersCreateInput,
    product_ids: number[],
    amounts: number[],
  ): Promise<orders> {
    if (product_ids.length !== amounts.length) {
      throw new BadRequestException(
        'Product IDs and amounts array lengths must match.',
      );
    }

    // Calculate total price
    let totalPrice = 0;
    for (let i = 0; i < product_ids.length; i++) {
      const product = await this.prisma.products.findUnique({
        where: { id: product_ids[i] },
      });

      if (!product) {
        throw new BadRequestException(
          `Product with ID ${product_ids[i]} not found.`,
        );
      }

      totalPrice += Number(product.price) * amounts[i];
    }

    // Create the order
    const order = await this.prisma.orders.create({
      data: {
        ...data,
        price: totalPrice,
      },
    });

    // Insert into the order_products table
    await this.insertOrderProducts(order.id, product_ids, amounts);

    return order;
  }

  // Helper to insert order_products
  private async insertOrderProducts(
    orderId: number,
    productIds: number[],
    amounts: number[],
  ) {
    for (let i = 0; i < productIds.length; i++) {
      await this.prisma.order_products.create({
        data: {
          order_id: orderId,
          product_id: productIds[i],
          amount: amounts[i],
        },
      });
    }
  }

  // Update an existing order
  async updateOrder(data: {
    where: Prisma.ordersWhereUniqueInput;
    orderData: Prisma.ordersUpdateInput;
    productIds: number[];
    amounts: number[];
  }): Promise<orders> {
    const { where, orderData, productIds, amounts } = data;

    // Check if the order exists
    const existingOrder = await this.prisma.orders.findUnique({
      where,
    });

    if (!existingOrder) {
      throw new NotFoundException(`Order with ID ${where.id} not found`);
    }

    // Calculate new total price (if necessary)
    let totalPrice = Number(existingOrder.price);
    if (orderData.price === undefined) {
      totalPrice = 0;
      for (let i = 0; i < productIds.length; i++) {
        const product = await this.prisma.products.findUnique({
          where: { id: productIds[i] },
        });

        if (!product) {
          throw new BadRequestException(
            `Product with ID ${productIds[i]} not found.`,
          );
        }

        totalPrice += Number(product.price) * amounts[i];
      }
    }

    // Update the order
    const updatedOrder = await this.prisma.orders.update({
      where,
      data: {
        ...orderData,
        price: totalPrice,
      },
    });

    // Update order_products by deleting the old and inserting the new ones
    await this.prisma.order_products.deleteMany({
      where: {
        order_id: where.id,
      },
    });

    await this.insertOrderProducts(where.id, productIds, amounts);

    return updatedOrder;
  }

  // Delete an order
  async deleteOrder(where: Prisma.ordersWhereUniqueInput): Promise<orders> {
    // First, delete related entries from order_products
    await this.prisma.order_products.deleteMany({
      where: {
        order_id: where.id,
      },
    });

    // Delete the order
    return this.prisma.orders.delete({
      where,
    });
  }
}
