import { MongoMemoryServer } from "mongodb-memory-server-core";
import { defineConfig } from "@antelopejs/interface-core/config";

let mongod: MongoMemoryServer;

export default defineConfig({
  name: "interface-data-api-test",
  cacheFolder: ".antelope/cache",
  modules: {
    local: {
      source: { type: "local", path: "." },
      importOverrides: {
        "@antelopejs/interface-api": "api",
        "@antelopejs/interface-database": "mongodb",
      },
    },
    mongodb: {
      source: {
        type: "package",
        package: "@antelopejs/mongodb",
        version: "1.3.1",
      },
    },
    api: {
      source: {
        type: "package",
        package: "@antelopejs/api",
        version: "1.3.0",
      },
      config: {
        publicBaseUrl: "http://127.0.0.1:5010",
        servers: [{ protocol: "http", host: "127.0.0.1", port: 5010 }],
      },
    },
  },
  test: {
    folder: "dist/tests",
    async setup() {
      mongod = await MongoMemoryServer.create();
      return {
        modules: {
          mongodb: {
            config: { url: mongod.getUri(), database: "antelopejs_test" },
          },
        },
      };
    },
    async cleanup() {
      await mongod.stop();
    },
  },
});
