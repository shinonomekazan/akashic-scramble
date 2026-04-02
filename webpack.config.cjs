const path = require("path");
const TerserPlugin = require("terser-webpack-plugin");
const Dotenv = require("dotenv-webpack");

const commonConfig = () => {
	const config = {
		mode: "none",
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
				{
					test: /\.svg$/,
					type: "asset/source",
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
	return config;
};

const akashicConfig = () => {
	const config = commonConfig();
	config.entry = {
		main: "./src/App.ts",
	};
	config.output = {
		path: path.resolve(__dirname, "public", "js"),
		filename: (pathData) => {
			return pathData.chunk.name === "vendor" ? "vendor.bundle.js" : "akashic.bundle.js";
		},
		library: {
			name: "app",
			type: "window",
		},
		clean: true,
	};
	return config;
};

const manageConfig = () => {
	const config = commonConfig();
	config.optimization.splitChunks = false;
	config.entry = {
		manage: "./src/Manage.ts",
	};
	config.output = {
		path: path.resolve(__dirname, "public", "js"),
		filename: "[name].bundle.js",
		library: "[name]",
	};
	return config;
};

module.exports = [akashicConfig, manageConfig];
