CREATE TABLE `audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`action` varchar(160) NOT NULL,
	`detail` text,
	`actorName` varchar(160),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `borrowings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ticketNumber` varchar(40) NOT NULL,
	`itemId` int NOT NULL,
	`borrowerName` varchar(160) NOT NULL,
	`borrowerUserId` int,
	`quantity` int NOT NULL,
	`purpose` text NOT NULL,
	`borrowDate` timestamp NOT NULL DEFAULT (now()),
	`plannedReturnDate` timestamp NOT NULL,
	`actualReturnDate` timestamp,
	`status` enum('Menunggu','Dipinjam','Ditolak','Dikembalikan','Terlambat') NOT NULL DEFAULT 'Menunggu',
	`decisionNote` text,
	`returnCondition` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `borrowings_id` PRIMARY KEY(`id`),
	CONSTRAINT `borrowings_ticketNumber_unique` UNIQUE(`ticketNumber`)
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `categories_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(40) NOT NULL,
	`name` varchar(160) NOT NULL,
	`categoryId` int NOT NULL,
	`totalQuantity` int NOT NULL DEFAULT 0,
	`availableQuantity` int NOT NULL DEFAULT 0,
	`condition` varchar(80) NOT NULL DEFAULT 'Baik',
	`location` varchar(160) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `items_id` PRIMARY KEY(`id`),
	CONSTRAINT `items_code_unique` UNIQUE(`code`)
);
