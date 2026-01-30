import { WithId, Place } from "../../src/types/firestore";

export const places: Omit<WithId<Place>, "createdAt" | "updatedAt">[] = [
	{
		id: "hajimari",
		x: 0,
		y: 0,
		name: "はじまりの地",
		behaviours: [
			{
				type: "connectionLimit",
				limit: 200,
			},
			{
				type: "defaultPermission",
				permission: "player",
			},
			{
				type: "holdableTime",
				time: 30 * 60 * 1000,
			},
		],
	},
	{
		id: "nibante",
		x: 1,
		y: 0,
		name: "二番手",
		behaviours: [
			{
				type: "connectionLimit",
				limit: 200,
			},
			{
				type: "defaultPermission",
				permission: "player",
			},
			{
				type: "holdableTime",
				time: 30 * 60 * 1000,
			},
		],
	},
	{
		id: "sanbanchi",
		x: 2,
		y: 0,
		name: "三番地",
		behaviours: [
			{
				type: "connectionLimit",
				limit: 200,
			},
			{
				type: "defaultPermission",
				permission: "player",
			},
			{
				type: "holdableTime",
				time: 30 * 60 * 1000,
			},
		],
	},
	{
		id: "4",
		x: 0,
		y: 1,
		name: "不吉通り",
		behaviours: [
			{
				type: "connectionLimit",
				limit: 200,
			},
			{
				type: "defaultPermission",
				permission: "player",
			},
			{
				type: "holdableTime",
				time: 30 * 60 * 1000,
			},
		],
	},
	{
		id: "center",
		x: 1,
		y: 1,
		name: "中心地",
		behaviours: [
			{
				type: "connectionLimit",
				limit: 500,
			},
			{
				type: "defaultPermission",
				permission: "player",
			},
			{
				type: "holdableTime",
				time: 60 * 60 * 1000,
			},
		],
	},
	{
		id: "square",
		x: 2,
		y: 1,
		name: "スクランブルスクエア",
		behaviours: [
			{
				type: "connectionLimit",
				limit: 200,
			},
			{
				type: "defaultPermission",
				permission: "player",
			},
			{
				type: "holdableTime",
				time: 30 * 60 * 1000,
			},
		],
	},
	{
		id: "7",
		x: 0,
		y: 2,
		name: "ラッキー街",
		behaviours: [
			{
				type: "connectionLimit",
				limit: 500,
			},
			{
				type: "defaultPermission",
				permission: "player",
			},
			{
				type: "holdableTime",
				time: 30 * 60 * 1000,
			},
		],
	},
	{
		id: "ace",
		x: 1,
		y: 2,
		name: "エース",
		behaviours: [
			{
				type: "connectionLimit",
				limit: 200,
			},
			{
				type: "defaultPermission",
				permission: "player",
			},
			{
				type: "holdableTime",
				time: 30 * 60 * 1000,
			},
		],
	},
	{
		id: "sumikko",
		x: 2,
		y: 2,
		name: "隅っこ",
		behaviours: [
			{
				type: "connectionLimit",
				limit: 200,
			},
			{
				type: "defaultPermission",
				permission: "player",
			},
			{
				type: "holdableTime",
				time: 30 * 60 * 1000,
			},
		],
	},
];
