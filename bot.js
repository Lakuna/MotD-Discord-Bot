const { Client, MessageEmbed, APIMessage } = require("discord.js");

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
const client = new Client({
	partials: [ "GUILD_MEMBER", "MESSAGE", "REACTION" ],
	ws: { intents: [ "GUILDS", "GUILD_MESSAGE_REACTIONS" ] }
});
// https://discord.com/api/oauth2/authorize?client_id=857292742120308756&permissions=117824&scope=applications.commands%20bot

// Application getter.
Object.defineProperty(client, 'app', { get: () => {
	const app = client.api.applications(client.user.id);
	if (process.env.TEST_GUILD_ID) { app.guilds(process.env.TEST_GUILD_ID); }
	return app;
}});

// Meme vote reactions.
const UPVOTE_IDENTIFIER = "%E2%9C%85"; // :white_check_mark:
const DOWNVOTE_IDENTIFIER = "%E2%9D%8E"; // :negative_squared_cross_mark:

// Time in a day.
const DAY_LENGTH = 1000 * 60 * 60 * 24;

// Colors.
const WARNING_COLOR = "#FDEE00";
const ERROR_COLOR = "#FF2400";
const SUCCESS_COLOR = "#32CD32";

// Error handling.
client.on("error", (error) => console.error(error));
client.on("shardError", (error) => console.error(error));

// On ready.
client.on("ready", async () => {
	console.log("Ready.");
	client.user.setActivity("Meme of the Day");

	/*
	Print commands:
	console.log(await client.app.commands.get());

	Create command:
	// https://discord.com/developers/docs/interactions/slash-commands#registering-a-command
	await client.app.commands.post({
		data: {
			name: "command_name",
			description: "command_description"
		}
	});

	Delete command:
	// https://discord.com/developers/docs/interactions/slash-commands#updating-and-deleting-a-command
	await client.app.commands('command_id').delete();
	*/
});

client.ws.on("INTERACTION_CREATE", async (interaction) => {
	// https://discord.com/developers/docs/interactions/slash-commands#responding-to-an-interaction

	switch (interaction.data.name) {
		case "motd":
			return new Promise((resolve, reject) => {
				const getAllMessagesSince = (channel, snowflake, output = []) => new Promise((resolve, reject) => {
					channel.messages.fetch({ limit: 100, before: output.length ? Math.min(...output.map((message) => message.id)) : interaction.id }, false)
						.then((messages) => {
							messages = Array.from(messages.values());
							for (const message of messages) {
								if (message.id >= snowflake) {
									output.push(message);
								} else {
									break;
								}
							}

							if (!output.length) {
								return resolve([]);
							}

							if (output.length % 100 == 0) {
								return getAllMessagesSince(channel, snowflake, output).then((messages) => resolve(messages));
							}

							return resolve(output);
						})
						.catch((error) => resolve([])); // Missing permissions; ignore channel.
				});

				client.guilds.fetch(interaction.guild_id).then((guild) => {
					let output = [];
					let fetched = 0;
					const channels = Array.from(guild.channels.cache.values())
						.filter((channel) => channel.type == "text" && channel.guild.me.permissionsIn(channel).has("VIEW_CHANNEL"));

					for (const channel of channels) {
						getAllMessagesSince(channel, new Snowflake((new Date(new Date() - DAY_LENGTH))))
							.then((messages) => output = output.concat(messages))
							.catch((error) => console.error(error))
							.finally(() => {
								fetched++;
								if (fetched >= channels.length) { resolve(output); }
							});
					}
				});
			})
			.then((messages) => {
				let bestMeme;
				for (const message of messages) {
					const upvoteReaction = message.reactions.cache.find((reaction) => reaction.emoji.identifier == UPVOTE_IDENTIFIER);
					const upvotes = upvoteReaction ? upvoteReaction.count : 0;

					const downvoteReaction = message.reactions.cache.find((reaction) => reaction.emoji.identifier == DOWNVOTE_IDENTIFIER);
					const downvotes = downvoteReaction ? downvoteReaction.count : 0;

					const meme = {
						message: message,
						score: upvotes - downvotes
					};

					if (!bestMeme || bestMeme.score < meme.score) {
						bestMeme = meme;
					}
				}

				if (!bestMeme) {
					return new MessageEmbed()
						.setColor(WARNING_COLOR)
						.setTitle("Failed to find any candidates.");
				}

				const output = new MessageEmbed()
					.setColor(SUCCESS_COLOR)
					.setTitle(`Meme of the Day ${new Date().getMonth() + 1}/${new Date().getDate()}/${new Date().getFullYear()}`)
					.setDescription(bestMeme.message.content)
					.setURL(bestMeme.message.url)
					.addField("Author", `${bestMeme.message.author}`, true)
					.addField("Score", bestMeme.score, true);

				const attachments = [];

				// Get attachments from message content.
				for (const word of bestMeme.message.content.split(/ +/)) {
					if (word.startsWith("http")) { attachments.push(word); }
				}

				// Get attachments from message attachments.
				for (const attachment of bestMeme.message.attachments.values()) {
					attachments.push(attachment.url);
				}

				if (attachments.length == 1) {
					if (attachments[0].endsWith(".png")
						|| attachments[0].endsWith(".jpg")
						|| attachments[0].endsWith(".jpeg")
						|| attachments[0].endsWith(".gif")) {
						output.setImage(attachments[0]);
					} else {
						output.attachFiles(attachments);
					}
				} else {
					output.attachFiles(attachments);
				}

				return output;
			}).then(async (embed) => {
				const embedToAPIMessage = async (embed) => {
					const { data, files } = await APIMessage.create(client.channels.resolve(interaction.channel_id), embed)
						.resolveData()
						.resolveFiles();

					return { ...data, files };
				};

				client.api.interactions(interaction.id, interaction.token).callback.post({
					data: {
						type: 4,
						data: await embedToAPIMessage(embed)
					}
				});
			})
			.catch((error) => console.error(error));
	}
});

client.on("messageReactionAdd", (reaction, user) => {
	const onFetchMember = (member) => {
		if (reaction.emoji.identifier != UPVOTE_IDENTIFIER && reaction.emoji.identifier != DOWNVOTE_IDENTIFIER) { return; }
		if (reaction.message.author.bot) { return; }

		reaction.message.react(UPVOTE_IDENTIFIER);
		reaction.message.react(DOWNVOTE_IDENTIFIER);
	};

	const onFetchMessage = () => {
		if (user.bot) { return; }

		const member = reaction.message.guild.members.cache.find((member) => member.user == user);
		if (member.partial) {
			member.fetch()
				.then(() => onFetchMember(member))
				.catch((error) => console.error(error));
		} else {
			onFetchMember(member);
		}
	}

	if (reaction.message.partial) {
		reaction.message.fetch()
			.then(() => onFetchMessage())
			.catch((error) => console.error(error));
	} else {
		onFetchMessage();
	}
});

// Login.
client.login(process.env.TOKEN);