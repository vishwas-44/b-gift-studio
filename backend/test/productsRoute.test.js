const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const http = require("node:http");

const productId = "28807568-9013-4cab-b6d3-a2348369e75c";
let queryResult = { data: [], error: null };
let queryFilters = [];
const supabasePath = require.resolve("../src/supabase");
const originalSupabaseModule = require.cache[supabasePath];

const mockSupabase = {
  from(table) {
    assert.equal(table, "products");
    return {
      select() {
        return this;
      },
      eq(column, value) {
        queryFilters.push([column, value]);
        return this;
      },
      order() {
        return Promise.resolve(queryResult);
      },
      maybeSingle() {
        return Promise.resolve(queryResult);
      },
    };
  },
};

require.cache[supabasePath] = {
  id: supabasePath,
  filename: supabasePath,
  loaded: true,
  exports: mockSupabase,
};
const productsRouter = require("../src/routes/products");
const app = express();
app.use("/api/products", productsRouter);
app.use((error, req, res, next) => {
  res.status(500).json({ success: false, message: "Internal server error" });
});
const server = http.createServer(app);

test.before(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
});

test.after(async () => {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  if (originalSupabaseModule) require.cache[supabasePath] = originalSupabaseModule;
  else delete require.cache[supabasePath];
});

async function request(path) {
  const address = server.address();
  return fetch(`http://127.0.0.1:${address.port}${path}`);
}

test("returns active products from the database response contract", async () => {
  queryResult = {
    data: [{ id: productId, name: "Gift", is_active: true }],
    error: null,
  };
  queryFilters = [];

  const response = await request("/api/products");
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, {
    success: true,
    count: 1,
    products: [{ id: productId, name: "Gift", is_active: true }],
  });
  assert.deepEqual(queryFilters, [["is_active", true]]);
});

test("validates product IDs before querying and returns existing products", async () => {
  queryFilters = [];
  const queryResponse = await request("/api/products?unexpected=value");
  assert.equal(queryResponse.status, 400);

  const invalidResponse = await request("/api/products/not-a-uuid");
  assert.equal(invalidResponse.status, 400);
  assert.deepEqual(queryFilters, []);

  queryResult = { data: { id: productId, name: "Gift", is_active: true }, error: null };
  const response = await request(`/api/products/${productId}`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, {
    success: true,
    product: { id: productId, name: "Gift", is_active: true },
  });
  assert.deepEqual(queryFilters, [
    ["id", productId],
    ["is_active", true],
  ]);
});

test("reports missing products and forwards database errors", async () => {
  queryResult = { data: null, error: null };
  const missingResponse = await request(`/api/products/${productId}`);
  assert.equal(missingResponse.status, 404);
  assert.deepEqual(await missingResponse.json(), {
    success: false,
    message: "Product not found.",
  });

  queryResult = { data: null, error: new Error("database unavailable") };
  const errorResponse = await request(`/api/products/${productId}`);
  assert.equal(errorResponse.status, 500);
  assert.deepEqual(await errorResponse.json(), {
    success: false,
    message: "Internal server error",
  });
});
