import path from "path";

const config = {
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    globals: true,
  },
};

export default config;
