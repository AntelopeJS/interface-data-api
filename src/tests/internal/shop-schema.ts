/** @internal @packageDocumentation */
import {
  BasicDataModel,
  Field,
  Index,
  RegisterSchema,
  RegisterTable,
  Relation,
  Table,
} from "@antelopejs/interface-database-decorators";

import { getSchemaInstance } from "../utils";

const currentTestName = "integration";
const customerTableName = `customers-${currentTestName}`;
const productTableName = `products-${currentTestName}`;
const orderTableName = `orders-${currentTestName}`;
const orderItemTableName = `order_items-${currentTestName}`;
const schemaName = "default";

@RegisterTable(customerTableName, schemaName)
export class Customer extends Table {
  declare _id: string;

  @Index()
  @Field("string")
  declare email: string;

  @Field("string")
  declare firstName: string;

  @Field("string")
  declare lastName: string;

  @Field("string")
  declare phone: string;

  @Field("string")
  declare address: string;

  @Field("string")
  declare city: string;

  @Field("string")
  declare postalCode: string;

  @Field("string")
  declare country: string;

  @Field("date")
  declare registrationDate: Date;

  @Field("boolean")
  declare isActive: boolean;

  @Field("number")
  declare loyaltyPoints: number;

  @Field(["string"])
  declare preferences: string[];
}

@RegisterTable(productTableName, schemaName)
export class Product extends Table {
  declare _id: string;

  @Index()
  @Field("string")
  declare sku: string;

  @Field("string")
  declare name: string;

  @Field("string")
  declare description: string;

  @Field("number")
  declare price: number;

  @Field("number")
  declare costPrice: number;

  @Field("number")
  declare stockQuantity: number;

  @Field("string")
  declare category: string;

  @Field("string")
  declare brand: string;

  @Field(["string"])
  declare tags: string[];

  @Field(["string"])
  declare images: string[];

  @Field("boolean")
  declare isActive: boolean;

  @Field("date")
  declare createdAt: Date;

  @Field("date")
  declare updatedAt: Date;
}

@RegisterTable(orderTableName, schemaName)
export class Order extends Table {
  declare _id: string;

  @Index()
  @Field("string")
  declare orderNumber: string;

  @Index()
  @Field("string")
  @Relation({ to: () => Customer })
  declare customerId: string;

  @Field("string")
  declare status: string;

  @Field("number")
  declare totalAmount: number;

  @Field("number")
  declare shippingCost: number;

  @Field("number")
  declare taxAmount: number;

  @Field("number")
  declare discountAmount: number;

  @Field("number")
  declare finalAmount: number;

  @Field("string")
  declare shippingAddress: string;

  @Field("string")
  declare billingAddress: string;

  @Field("string")
  declare paymentMethod: string;

  @Field("string")
  declare notes: string;

  @Field("date")
  declare createdAt: Date;

  @Field("date")
  declare updatedAt: Date;
}

@RegisterTable(orderItemTableName, schemaName)
export class OrderItem extends Table {
  declare _id: string;

  @Index()
  @Field("string")
  @Relation({ to: () => Order })
  declare orderId: string;

  @Index()
  @Field("string")
  @Relation({ to: () => Product })
  declare productId: string;

  @Field("number")
  declare quantity: number;

  @Field("number")
  declare unitPrice: number;

  @Field("number")
  declare totalPrice: number;

  @Field("number")
  declare finalPrice: number;

  @Field("number")
  declare discount: number;
}

export class CustomerModel extends BasicDataModel(
  Customer,
  customerTableName,
) {}
export class ProductModel extends BasicDataModel(Product, productTableName) {}
export class OrderModel extends BasicDataModel(Order, orderTableName) {}
export class OrderItemModel extends BasicDataModel(
  OrderItem,
  orderItemTableName,
) {}

const testCustomers: Partial<Customer>[] = [
  {
    firstName: "Bob",
    lastName: "Bobberson",
    email: "bob.bobberson@email.com",
    phone: "+1234567890",
    address: "123 Poutine Square",
    city: "Quebec City",
    postalCode: "G1K 1K1",
    country: "Canada",
    registrationDate: new Date("2023-01-15"),
    isActive: true,
    loyaltyPoints: 150,
    preferences: ["electronics", "books"],
  },
  {
    firstName: "Alice",
    lastName: "Alison",
    email: "alice.alison@email.com",
    phone: "+33123456789",
    address: "456 Baguette Street",
    city: "Lyon",
    postalCode: "69001",
    country: "France",
    registrationDate: new Date("2023-03-20"),
    isActive: true,
    loyaltyPoints: 75,
    preferences: ["fashion", "home"],
  },
  {
    firstName: "John",
    lastName: "Doe",
    email: "john.doe@email.com",
    phone: "+32123456789",
    address: "789 Fries Avenue",
    city: "Brussels",
    postalCode: "1000",
    country: "Belgium",
    registrationDate: new Date("2023-06-10"),
    isActive: false,
    loyaltyPoints: 0,
    preferences: ["sports"],
  },
];

const testProducts: Partial<Product>[] = [
  {
    sku: "LAPTOP-001",
    name: "Gaming Laptop",
    description: "High performance gaming laptop",
    price: 1299.99,
    costPrice: 899.99,
    stockQuantity: 15,
    category: "electronics",
    brand: "TechCorp",
    tags: ["gaming", "laptop", "high-performance"],
    images: ["laptop1.jpg", "laptop2.jpg"],
    isActive: true,
    createdAt: new Date("2023-01-01"),
    updatedAt: new Date("2023-12-01"),
  },
  {
    sku: "PHONE-002",
    name: "Premium Smartphone",
    description: "Professional camera smartphone",
    price: 899.99,
    costPrice: 599.99,
    stockQuantity: 25,
    category: "electronics",
    brand: "MobileTech",
    tags: ["smartphone", "camera", "premium"],
    images: ["phone1.jpg", "phone2.jpg"],
    isActive: true,
    createdAt: new Date("2023-02-15"),
    updatedAt: new Date("2023-11-15"),
  },
  {
    sku: "BOOK-003",
    name: "The Soldering Bible",
    description: "Complete guide to soldering components",
    price: 49.99,
    costPrice: 25.99,
    stockQuantity: 50,
    category: "books",
    brand: "TechBooks",
    tags: ["soldering", "electronics", "education"],
    images: ["book1.jpg"],
    isActive: true,
    createdAt: new Date("2023-03-01"),
    updatedAt: new Date("2023-10-01"),
  },
  {
    sku: "SHIRT-004",
    name: "Organic Cotton T-shirt",
    description: "Comfortable organic cotton t-shirt",
    price: 29.99,
    costPrice: 15.99,
    stockQuantity: 100,
    category: "fashion",
    brand: "EcoFashion",
    tags: ["cotton", "organic", "comfortable"],
    images: ["shirt1.jpg", "shirt2.jpg"],
    isActive: true,
    createdAt: new Date("2023-04-10"),
    updatedAt: new Date("2023-09-10"),
  },
];

export async function initializeDatabase() {
  await RegisterSchema(schemaName);
}

export async function cleanTables() {
  const db = getSchemaInstance(schemaName);
  await Promise.all([
    db.table(customerTableName).delete(),
    db.table(productTableName).delete(),
    db.table(orderTableName).delete(),
    db.table(orderItemTableName).delete(),
  ]);
}

export async function createTestData() {
  const db = getSchemaInstance(schemaName);
  const customerModel = new CustomerModel(db);
  const productModel = new ProductModel(db);
  const orderModel = new OrderModel(db);
  const customerResults = await customerModel.insert(testCustomers);
  const productResults = await productModel.insert(testProducts);

  return {
    customerIds: customerResults,
    productIds: productResults,
    customerModel,
    productModel,
    orderModel,
  };
}
