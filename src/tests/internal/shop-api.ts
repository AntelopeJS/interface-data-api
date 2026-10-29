/** @internal @packageDocumentation */
import { Controller } from "@antelopejs/interface-api";
import {
  DataController,
  DefaultRoutes,
  RegisterDataController,
} from "../../index";
import {
  Access,
  AccessMode,
  Listable,
  Mandatory,
  ModelReference,
  Sortable,
  Validator,
} from "../../metadata";
import { Model } from "@antelopejs/interface-database-decorators";

import {
  Customer,
  CustomerModel,
  Order,
  OrderItem,
  OrderItemModel,
  OrderModel,
  Product,
  ProductModel,
} from "./shop-schema";
import { isNumber, isString } from "../../internal/guards";

@RegisterDataController()
class _CustomerAPI extends DataController(
  Customer,
  DefaultRoutes.All,
  Controller("/customers"),
) {
  @ModelReference()
  @Model(CustomerModel)
  declare customerModel: CustomerModel;

  @Listable()
  @Access(AccessMode.ReadOnly)
  declare _id: string;

  @Listable()
  @Access(AccessMode.ReadWrite)
  @Mandatory("new", "edit")
  @Validator((value) => isString(value) && value.length >= 2)
  declare firstName: string;

  @Listable()
  @Access(AccessMode.ReadWrite)
  @Mandatory("new", "edit")
  @Validator((value) => isString(value) && value.length >= 2)
  declare lastName: string;

  @Listable()
  @Access(AccessMode.ReadWrite)
  @Mandatory("new", "edit")
  @Validator((value) => {
    if (!isString(value)) return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value);
  })
  declare email: string;

  @Listable()
  @Access(AccessMode.ReadWrite)
  @Validator((value) => isString(value) && value.length >= 10)
  declare phone: string;

  @Listable()
  @Access(AccessMode.ReadWrite)
  declare address: string;

  @Listable()
  @Access(AccessMode.ReadWrite)
  declare city: string;

  @Listable()
  @Access(AccessMode.ReadWrite)
  declare postalCode: string;

  @Listable()
  @Access(AccessMode.ReadWrite)
  declare country: string;

  @Listable()
  @Access(AccessMode.ReadOnly)
  @Sortable({ noIndex: true })
  declare registrationDate: Date;

  @Listable()
  @Access(AccessMode.ReadWrite)
  declare isActive: boolean;

  @Listable()
  @Access(AccessMode.ReadWrite)
  @Sortable({ noIndex: true })
  declare loyaltyPoints: number;

  @Listable()
  @Access(AccessMode.ReadWrite)
  declare preferences: string[];
}

@RegisterDataController()
class _ProductAPI extends DataController(
  Product,
  DefaultRoutes.All,
  Controller("/products"),
) {
  @ModelReference()
  @Model(ProductModel)
  declare productModel: ProductModel;

  @Listable()
  @Access(AccessMode.ReadOnly)
  declare _id: string;

  @Listable()
  @Access(AccessMode.ReadWrite)
  @Mandatory("new", "edit")
  @Validator((value) => isString(value) && value.length >= 3)
  declare sku: string;

  @Listable()
  @Access(AccessMode.ReadWrite)
  @Mandatory("new", "edit")
  @Validator((value) => isString(value) && value.length >= 3)
  declare name: string;

  @Listable()
  @Access(AccessMode.ReadWrite)
  declare description: string;

  @Listable()
  @Access(AccessMode.ReadWrite)
  @Mandatory("new", "edit")
  @Validator((value) => isNumber(value) && value >= 0)
  @Sortable({ noIndex: true })
  declare price: number;

  @Access(AccessMode.WriteOnly)
  @Validator((value) => isNumber(value) && value >= 0)
  @Sortable({ noIndex: true })
  declare costPrice: number;

  @Listable()
  @Access(AccessMode.ReadWrite)
  @Mandatory("new", "edit")
  @Validator((value) => isNumber(value) && value >= 0)
  @Sortable({ noIndex: true })
  declare stockQuantity: number;

  @Listable()
  @Access(AccessMode.ReadWrite)
  @Mandatory("new", "edit")
  declare category: string;

  @Listable()
  @Access(AccessMode.ReadWrite)
  declare brand: string;

  @Listable()
  @Access(AccessMode.ReadWrite)
  declare tags: string[];

  @Listable()
  @Access(AccessMode.ReadWrite)
  declare images: string[];

  @Listable()
  @Access(AccessMode.ReadWrite)
  declare isActive: boolean;

  @Listable()
  @Access(AccessMode.ReadOnly)
  @Sortable({ noIndex: true })
  declare createdAt: Date;

  @Listable()
  @Access(AccessMode.ReadOnly)
  @Sortable({ noIndex: true })
  declare updatedAt: Date;
}

@RegisterDataController()
class _OrderAPI extends DataController(
  Order,
  DefaultRoutes.All,
  Controller("/orders"),
) {
  @ModelReference()
  @Model(OrderModel)
  declare orderModel: OrderModel;

  @Listable()
  @Access(AccessMode.ReadOnly)
  declare _id: string;

  @Listable()
  @Access(AccessMode.ReadWrite)
  @Mandatory("new", "edit")
  declare orderNumber: string;

  @Listable()
  @Access(AccessMode.ReadWrite)
  @Mandatory("new", "edit")
  declare customerId: string;

  @Listable()
  @Access(AccessMode.ReadWrite)
  @Mandatory("new", "edit")
  @Validator((value) =>
    ["pending", "processing", "shipped", "delivered", "cancelled"].some(
      (status) => status === value,
    ),
  )
  declare status: string;

  @Listable()
  @Access(AccessMode.ReadWrite)
  @Sortable({ noIndex: true })
  declare totalAmount: number;

  @Access(AccessMode.ReadWrite)
  declare shippingCost: number;

  @Access(AccessMode.ReadWrite)
  declare taxAmount: number;

  @Access(AccessMode.ReadWrite)
  declare discountAmount: number;

  @Listable()
  @Access(AccessMode.ReadWrite)
  @Sortable({ noIndex: true })
  declare finalAmount: number;

  @Access(AccessMode.ReadWrite)
  declare shippingAddress: string;

  @Access(AccessMode.ReadWrite)
  declare billingAddress: string;

  @Access(AccessMode.ReadWrite)
  declare paymentMethod: string;

  @Access(AccessMode.ReadWrite)
  declare notes: string;

  @Listable()
  @Access(AccessMode.ReadOnly)
  @Sortable({ noIndex: true })
  declare createdAt: Date;

  @Listable()
  @Access(AccessMode.ReadOnly)
  @Sortable({ noIndex: true })
  declare updatedAt: Date;
}

@RegisterDataController()
class _OrderItemAPI extends DataController(
  OrderItem,
  DefaultRoutes.All,
  Controller("/order-items"),
) {
  @ModelReference()
  @Model(OrderItemModel)
  declare orderItemModel: OrderItemModel;

  @Listable()
  @Access(AccessMode.ReadOnly)
  declare _id: string;

  @Listable()
  @Access(AccessMode.ReadWrite)
  @Mandatory("new", "edit")
  declare orderId: string;

  @Listable()
  @Access(AccessMode.ReadWrite)
  @Mandatory("new", "edit")
  declare productId: string;

  @Listable()
  @Access(AccessMode.ReadWrite)
  @Mandatory("new", "edit")
  @Validator((value) => isNumber(value) && value > 0)
  declare quantity: number;

  @Listable()
  @Access(AccessMode.ReadOnly)
  declare unitPrice: number;

  @Access(AccessMode.ReadWrite)
  declare discount: number;
}
