const path = require("path");
const TerserPlugin = require("terser-webpack-plugin");
const Dotenv = require("dotenv-webpack");

const commonConfig = () => {
	return {
		mode: "none",
		entry: {
			main: "./src/App.ts",
		},
		output: {
			path: path.resolve(__dirname, "public", "js"),
			filename: (pathData) => {
				return pathData.chunk.name === "vendor" ? "vendor.bundle.js" : "akashic.bundle.js";
			},
			library: {
				name: "app",
				type: "window",
			},
			clean: true,
		},
		module: {
			rules: [
				{
					test: /\.ts$/,
					use: "ts-loader",
					exclude: /node_modules/,
				},
				{
					test: /\.css$/,
					use: ["style-loader", "css-loader"],
				},
			],
		},
		resolve: {
			extensions: [".ts", ".js"],
		},
		devtool: false,
		plugins: [
			new Dotenv({
				systemvars: true,
			}),
		],
		optimization: {
			minimize: false,
			minimizer: [
				new TerserPlugin({
					terserOptions: {
						compress: { drop_console: false },
						format: { comments: false },
					},
					extractComments: true,
				}),
			],
			splitChunks: {
				cacheGroups: {
					vendor: {
						test: /node_modules/,
						name: "vendor",
						chunks: "all",
						enforce: true,
					},
				},
			},
		},
	};
};

module.exports = (env, argv) => commonConfig(env, argv);
