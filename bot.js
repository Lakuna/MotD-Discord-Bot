const { Client } = require("discord.js");

// Discord snowflake class.
class Snowflake {
	static EPOCH = 1420070400000; // First second of 2015.

	static BITS = {
		TIMESTAMP: 42,
		WORKER: 5,
		PROCESS: 5,
		INCREMENT: 12
	};

	static #dateToSnowflake = (date) => {
			let translatedDate = BigInt(date.getTime() - Snowflake.EPOCH);

			// Convert date to binary.
			let output = '';
			while (translatedDate > 0) {
				output = `${translatedDate % 2n}${output}`;
				translatedDate /= 2n;
			}

			// Fill 0s to make 64-bit
			while (output.length < Snowflake.BITS.TIMESTAMP) {
				output = `0${output}`;
			}
			while (output.length < Object.keys(Snowflake.BITS)
				   .reduce((a, c) => a + parseInt(Snowflake.BITS[c] || 0), 0)) {
				output += '0';
			}

			return BigInt(`0b${output}`);
	};

	#value; // BigInt representation of Snowflake.

	constructor(value = new Date()) {
		if (
			typeof value == 'number'
			|| typeof value == 'bigint'
			|| typeof value == 'string' && !isNaN(parseInt(value))
		) {
			this.#value = BigInt(value);
		} else if (value instanceof Date) {
			this.#value = Snowflake.#dateToSnowflake(value);
		} else {
			throw new Error(`Cannot create a Snowflake from supplied value (${value}).`);
		}
	}

	get binary() {
		let decimal = this.#value;
		let binary = '';

		// Convert to binary.
		while (decimal > 0) {
			binary = `${decimal % 2n}${binary}`;
			decimal /= 2n;
		}

		// Fill 0s to make 64-bit.
		while (binary.length < Object.keys(Snowflake.BITS)
			   .reduce((a, c) => a + parseInt(Snowflake.BITS[c] || 0), 0)) {
			binary = `0${binary}`;
		}

		return binary;
	}

	get timestamp() {
		return new Date(parseInt(
			this.binary.substring(
				0,
				
				Snowflake.BITS.TIMESTAMP
			), 2) + Snowflake.EPOCH);
	}

	get worker() {
		return parseInt(
			this.binary.substring(
				Snowflake.BITS.TIMESTAMP,
				
				Snowflake.BITS.TIMESTAMP +
				Snowflake.BITS.WORKER
			), 2);
	}

	get process() {
		return parseInt(
			this.binary.substring(
				Snowflake.BITS.TIMESTAMP +
				Snowflake.BITS.WORKER,
				
				Snowflake.BITS.TIMESTAMP +
				Snowflake.BITS.WORKER +
				Snowflake.BITS.PROCESS
			), 2);
	}

	get increment() {
		return parseInt(
			this.binary.substring(
				Snowflake.BITS.TIMESTAMP +
				Snowflake.BITS.WORKER +
				Snowflake.BITS.PROCESS
			), 2);
	}

	toString() {
		return `${this.#value}`;
	}
}

// Create client.
const client = new Client();
// https://discord.com/api/oauth2/authorize?client_id=857292742120308756&permissions=117824&scope=applications.commands%20bot

// Application getter.
Object.defineProperty(client, 'app', { get: () => {
	const app = client.api.applications(client.user.id);
	if (process.env.TEST_GUILD_ID) { app.guilds(process.env.TEST_GUILD_ID); }
	return app;
}});

// Meme vote reactions.
const upvote = "%E2%9C%85"; // :white_check_mark:
const downvote = "%E2%9D%8E"; // :negative_squared_cross_mark:

// Error handling.
client.on("error", (error) => console.error(error));
client.on("shardError", (error) => console.error(error));

// On ready.
client.on("ready", async () => {
	console.log("Ready.");
	client.user.setActivity("Meme of the Day");

	/*
	Log commands:
	console.log(await client.app.commands.get());

	Create command:
	await client.app.commands.post({
		data: {
			name: "command_name",
			description: "command_description"
		}
	});

	Delete command:
	await client.app.commands('command_id').delete();
	*/
});

client.ws.on("INTERACTION_CREATE", async (interaction) => {
	switch (interaction.data.name) {
		case "motd":
			client.api.interactions(interaction.id, interaction.token).callback.post({
				data: {
					type: 4,
					data: {
						content: "Placeholder."
					}
				}
			});
			break;
	}
});

// Login.
client.login(process.env.TOKEN);