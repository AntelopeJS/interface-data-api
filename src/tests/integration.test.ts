import { expect } from "chai";

import { type ListResponse, readJson } from "./internal/http";
import "./internal/shop-api";
import {
  cleanTables,
  createTestData,
  Customer,
  initializeDatabase,
  Product,
} from "./internal/shop-schema";
import {
  editRequest,
  getRequest,
  listRequest,
  newRequest,
  request,
  type CreatedRow,
  validateObject,
} from "./utils";

describe("Integration tests", () => {
  before(async () => {
    await initializeDatabase();
  });

  beforeEach(async () => {
    await cleanTables();
  });

  it("workflow complete of customer management", async () =>
    await expectCustomerWorkflow());
  it("workflow complete of product management", async () =>
    await expectProductWorkflow());
  it("workflow complete of order management", async () =>
    await expectOrderWorkflow());
  it("stock management and automatic update", async () =>
    await expectStockUpdates());
  it("advanced search and filtering", async () =>
    await expectSearchAndFilters());
  it("client preferences management and recommendations", async () =>
    await expectClientPreferences());
  it("error management and complex validation", async () =>
    await expectErrorsAndValidation());
});

async function expectCustomerWorkflow() {
  const { customerModel } = await createTestData();

  const newCustomer = {
    firstName: "Sophie",
    lastName: "Marrone",
    email: "sophie.marrone@email.com",
    phone: "+393334445556",
    address: "Via Pasta 10",
    city: "Naples",
    postalCode: "80100",
    country: "Italy",
    isActive: true,
    loyaltyPoints: 0,
    preferences: ["art", "music"],
  };

  const createResponse = await newRequest("customers", newCustomer);
  expect(createResponse.status).to.equal(200);
  const created = await readJson<CreatedRow>(createResponse);
  expect(created._id).to.be.a("string");
  const createdIds = [created._id];

  const getResponse = await getRequest("customers", { id: createdIds[0] });
  expect(getResponse.status).to.equal(200);
  const customer = await readJson<Customer>(getResponse);
  await validateObject(customer, newCustomer, [
    "firstName",
    "lastName",
    "email",
    "city",
  ]);

  const updateData = {
    ...newCustomer,
    loyaltyPoints: 50,
    preferences: ["art", "music", "travel"],
  };
  const updateResponse = await editRequest("customers", updateData, {
    id: createdIds[0],
  });
  expect(updateResponse.status).to.equal(200);

  const updatedCustomer = await customerModel.get(createdIds[0]);
  expect(updatedCustomer?.loyaltyPoints).to.equal(50);
  expect(updatedCustomer?.preferences).to.include("travel");

  const listResponse = await listRequest("customers", {
    sortKey: "registrationDate",
    sortDirection: "desc",
    limit: "2",
  });
  expect(listResponse.status).to.equal(200);
  const listData = await readJson<{ results: Customer[] }>(listResponse);
  expect(listData.results).to.have.length(2);
}

async function expectProductWorkflow() {
  const { productModel } = await createTestData();

  const newProduct = {
    sku: "HEADPHONES-005",
    name: "Casque audio sans fil",
    description: "Casque audio haute qualité avec réduction de bruit",
    price: 199.99,
    costPrice: 120.0,
    stockQuantity: 30,
    category: "electronics",
    brand: "AudioTech",
    tags: ["wireless", "noise-cancelling", "premium"],
    images: ["headphones1.jpg", "headphones2.jpg"],
    isActive: true,
  };

  const createResponse = await newRequest("products", newProduct);
  expect(createResponse.status).to.equal(200);
  const createdIds = [(await readJson<CreatedRow>(createResponse))._id];

  const stockUpdate = { ...newProduct, stockQuantity: 25 };
  const updateResponse = await editRequest("products", stockUpdate, {
    id: createdIds[0],
  });
  expect(updateResponse.status).to.equal(200);

  const updatedProduct = await productModel.get(createdIds[0]);
  expect(updatedProduct?.stockQuantity).to.equal(25);

  const listResponse = await listRequest("products", {
    sortKey: "price",
    sortDirection: "asc",
    limit: "3",
  });
  expect(listResponse.status).to.equal(200);
  const listData = await readJson<{ results: Product[] }>(listResponse);
  expect(listData.results).to.have.length(3);

  const categoryResponse = await listRequest("products", {
    category: "electronics",
  });
  expect(categoryResponse.status).to.equal(200);
  const categoryData = await readJson<ListResponse<Product>>(categoryResponse);
  expect(categoryData.results.length).to.be.greaterThan(0);
}

async function expectOrderWorkflow() {
  const { customerIds, productIds, orderModel } = await createTestData();

  const orderData = {
    orderNumber: "ORD-2024-001",
    customerId: customerIds[0],
    status: "pending",
    totalAmount: 0,
    shippingCost: 9.99,
    taxAmount: 0,
    discountAmount: 0,
    finalAmount: 0,
    shippingAddress: "Via Pasta 10, Naples, 80100",
    billingAddress: "Via Pasta 10, Naples, 80100",
    paymentMethod: "credit_card",
    notes: "Express delivery requested",
  };

  const orderResponse = await newRequest("orders", orderData);
  expect(orderResponse.status).to.equal(200);
  const orderIds = [(await readJson<CreatedRow>(orderResponse))._id];

  const orderItem1 = {
    orderId: orderIds[0],
    productId: productIds[0],
    quantity: 2,
    unitPrice: 1299.99,
    totalPrice: 2599.98,
    discount: 0,
  };

  const orderItem2 = {
    orderId: orderIds[0],
    productId: productIds[1],
    quantity: 1,
    unitPrice: 899.99,
    totalPrice: 899.99,
    discount: 50.0,
  };

  const item1Response = await newRequest("order-items", orderItem1);
  const item2Response = await newRequest("order-items", orderItem2);
  expect(item1Response.status).to.equal(200);
  expect(item2Response.status).to.equal(200);

  const totalAmount = 2599.98 + (899.99 - 50.0);
  const taxAmount = totalAmount * 0.2;
  const finalAmount = totalAmount + taxAmount + 9.99;

  const orderUpdate = {
    ...orderData,
    totalAmount,
    taxAmount,
    finalAmount,
  };

  const updateResponse = await editRequest("orders", orderUpdate, {
    id: orderIds[0],
  });
  expect(updateResponse.status).to.equal(200);

  const updatedOrder = await orderModel.get(orderIds[0]);
  expect(updatedOrder?.totalAmount).to.equal(totalAmount);
  expect(updatedOrder?.finalAmount).to.equal(finalAmount);

  const statusUpdate = { ...orderData, status: "processing" };
  const statusResponse = await editRequest("orders", statusUpdate, {
    id: orderIds[0],
  });
  expect(statusResponse.status).to.equal(200);

  const finalOrder = await orderModel.get(orderIds[0]);
  expect(finalOrder?.status).to.equal("processing");
}

async function expectStockUpdates() {
  const { productIds, productModel } = await createTestData();

  const initialProduct = await productModel.get(productIds[0]);
  const initialStock = initialProduct?.stockQuantity || 0;

  const stockReduction = { ...initialProduct, stockQuantity: initialStock - 3 };
  const updateResponse = await editRequest("products", stockReduction, {
    id: productIds[0],
  });
  expect(updateResponse.status).to.equal(200);

  const updatedProduct = await productModel.get(productIds[0]);
  expect(updatedProduct?.stockQuantity).to.equal(initialStock - 3);

  const invalidStock = { stockQuantity: -5 };
  const invalidResponse = await editRequest("products", invalidStock, {
    id: productIds[0],
  });
  expect(invalidResponse.status).to.equal(400);

  const restock = { ...initialProduct, stockQuantity: initialStock + 10 };
  const restockResponse = await editRequest("products", restock, {
    id: productIds[0],
  });
  expect(restockResponse.status).to.equal(200);

  const restockedProduct = await productModel.get(productIds[0]);
  expect(restockedProduct?.stockQuantity).to.equal(initialStock + 10);
}

async function expectSearchAndFilters() {
  await createTestData();

  const categoryResponse = await listRequest("products", {
    category: "electronics",
    sortKey: "price",
    sortDirection: "desc",
  });
  expect(categoryResponse.status).to.equal(200);
  const categoryData = await readJson<ListResponse<Product>>(categoryResponse);
  expect(categoryData.results.length).to.be.greaterThan(0);

  const activeCustomersResponse = await listRequest("customers", {
    isActive: "true",
    sortKey: "loyaltyPoints",
    sortDirection: "desc",
  });
  expect(activeCustomersResponse.status).to.equal(200);
  const activeCustomersData = await readJson<ListResponse<Customer>>(
    activeCustomersResponse,
  );
  expect(activeCustomersData.results.length).to.be.greaterThan(0);

  const paginatedResponse = await listRequest("products", {
    limit: "2",
    offset: "1",
  });
  expect(paginatedResponse.status).to.equal(200);
  const paginatedData =
    await readJson<ListResponse<Product>>(paginatedResponse);
  expect(paginatedData.results).to.have.length(2);
  expect(paginatedData.total).to.be.greaterThan(2);

  const pendingOrdersResponse = await listRequest("orders", {
    status: "pending",
    sortKey: "createdAt",
    sortDirection: "desc",
  });
  expect(pendingOrdersResponse.status).to.equal(200);
}

async function expectClientPreferences() {
  const { customerIds, customerModel } = await createTestData();

  const customer = await customerModel.get(customerIds[0]);
  const newPreferences = ["electronics", "gaming", "tech"];
  const preferenceUpdate = { ...customer, preferences: newPreferences };
  const updateResponse = await editRequest("customers", preferenceUpdate, {
    id: customerIds[0],
  });
  expect(updateResponse.status).to.equal(200);

  const updatedCustomer = await customerModel.get(customerIds[0]);
  expect(updatedCustomer?.preferences).to.deep.equal(newPreferences);

  const electronicsResponse = await listRequest("products", {
    category: "electronics",
    sortKey: "price",
    sortDirection: "asc",
  });
  expect(electronicsResponse.status).to.equal(200);
  const electronicsData =
    await readJson<ListResponse<Product>>(electronicsResponse);
  expect(electronicsData.results.length).to.be.greaterThan(0);

  const loyaltyUpdate = { ...updatedCustomer, loyaltyPoints: 200 };
  const loyaltyResponse = await editRequest("customers", loyaltyUpdate, {
    id: customerIds[0],
  });
  expect(loyaltyResponse.status).to.equal(200);

  const customerWithLoyalty = await customerModel.get(customerIds[0]);
  expect(customerWithLoyalty?.loyaltyPoints).to.equal(200);
}

async function expectErrorsAndValidation() {
  const invalidCustomer = {
    firstName: "Test",
    lastName: "User",
    email: "invalid-email",
    phone: "123",
    isActive: true,
    loyaltyPoints: 0,
    preferences: ["test"],
  };

  const invalidEmailResponse = await newRequest("customers", invalidCustomer);
  expect(invalidEmailResponse.status).to.equal(400);
  const emailError = await invalidEmailResponse.text();
  expect(emailError).to.include("email");

  const invalidProduct = {
    sku: "TEST-001",
    name: "Test Product",
    price: -50.0,
    stockQuantity: 10,
    category: "test",
    isActive: true,
  };

  const invalidPriceResponse = await newRequest("products", invalidProduct);
  expect(invalidPriceResponse.status).to.equal(400);
  const priceError = await invalidPriceResponse.text();
  expect(priceError).to.include("price");

  const invalidOrderItem = {
    orderId: "fake-order-id",
    productId: "fake-product-id",
    quantity: 0,
    unitPrice: 10.0,
    totalPrice: 0,
    discount: 0,
  };

  const invalidQuantityResponse = await newRequest(
    "order-items",
    invalidOrderItem,
  );
  expect(invalidQuantityResponse.status).to.equal(400);
  const quantityError = await invalidQuantityResponse.text();
  expect(quantityError).to.include("quantity");

  const { customerIds } = await createTestData();
  const invalidStatusUpdate = { status: "invalid_status" };
  const invalidStatusResponse = await editRequest(
    "orders",
    invalidStatusUpdate,
    { id: customerIds[0] },
  );
  expect(invalidStatusResponse.status).to.equal(400);

  const invalidRouteResponse = await request("customers", "nonexistent", "GET");
  expect(invalidRouteResponse.status).to.equal(404);

  const missingFieldsCustomer = {
    firstName: "Test",
    email: "test@example.com",
    isActive: true,
    loyaltyPoints: 0,
    preferences: ["test"],
  };

  const missingFieldsResponse = await newRequest(
    "customers",
    missingFieldsCustomer,
  );
  expect(missingFieldsResponse.status).to.equal(400);
  const missingFieldsError = await missingFieldsResponse.text();
  expect(missingFieldsError).to.include("lastName");
}
