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
// Invite link: https://discord.com/api/oauth2/authorize?client_id=857292742120308756&permissions=117824&scope=applications.commands%20bot
const client = new Client({
	partials: [ "GUILD_MEMBER", "MESSAGE", "REACTION" ],
	ws: { intents: [ "GUILDS", "GUILD_MESSAGE_REACTIONS" ] }
});

// Application getter.
Object.defineProperty(client, "app", { get: () => client.api.applications(client.user.id) });

// Emoji identifiers.
const UPVOTE_IDENTIFIER = "%E2%9C%85"; // :white_check_mark:
const DOWNVOTE_IDENTIFIER = "%E2%9D%8E"; // :negative_squared_cross_mark:

// Time in a day (milliseconds).
const DAY_LENGTH = 1000 * 60 * 60 * 24;

// Colors.
const SUCCESS_COLOR = 0x50C878;
const WARNING_COLOR = 0xFFE791;
const ERROR_COLOR = 0xC80815;

// Error handling.
client.on("error", console.error);
client.on("shardError", console.error);

// Startup.
client.on("ready", () => client.user.setActivity("Meme of the Day"));

// Handle slash commands.
client.ws.on("INTERACTION_CREATE", async (interaction) => {
	switch (interaction.data.name) {
		case "motd":
			const getMessagesSince = async (channel, snowflake, output = []) => {
				let messages;

				// Get a group of 100 messages from a channel.
				try {
					messages = Array.from((await channel.messages.fetch({
						limit: 100,
						before: output.length
							? Math.min(...output.map((message) => message.id))
							: interaction.id
					}, false)).values());
				} catch { return []; } // Bot doesn't have permission to fetch messages from this channel.

				// Add messages to output if they're newer than the snowflake.
				for (const message of messages) {
					if (message.id >= snowflake) { output.push(message); } else { break; }
				}

				// Return an empty array if no messages were added.
				if (!output.length) { return []; }

				// If not all of the fetched messages were added to the output, return.
				if (output.length % 100) { return output; }

				// If all of the fetched messages were added to the output, recursively look for more.
				return await getMessagesSince(channel, snowflake, output);
			};

			// Get all messages sent in the last day from all channels.
			let messages = [];
			const guild = await client.guilds.fetch(interaction.guild_id);
			const channels = Array.from(guild.channels.cache.values())
				.filter((channel) => channel.type == "text" && channel.guild.me.permissionsIn(channel).has("VIEW_CHANNEL"));
			for (const channel of channels) {
				try {
					messages = messages.concat(await getMessagesSince(channel, new Snowflake((new Date(new Date() - DAY_LENGTH)))));
				} catch (error) {
					return client.api.interactions(interaction.id, interaction.token).callback.post({
						data: {
							type: 4,
							data: {
								embeds: [{
									title: "Error fetching messages.",
									type: "rich",
									color: ERROR_COLOR,
									fields: [
										{
											name: "Channel",
											value: `${channel}`,
										},
										{
											name: "Error",
											value: `${error}`
										}
									]
								}]
							}
						}
					});
				}
			}

			// Find the best meme.
			let bestMeme;
			const reactionCount = (message, identifier) => message.reactions.cache.find((reaction) => reaction.emoji.identifier == identifier)?.count ?? 0;
			for (const message of messages) {
				const meme = {
					message: message,
					score: reactionCount(message, UPVOTE_IDENTIFIER) - reactionCount(message, DOWNVOTE_IDENTIFIER)
				};
				
				bestMeme = (bestMeme?.score ?? 0) < meme.score ? meme : bestMeme;
			}
			if (!bestMeme) {
				return client.api.interactions(interaction.id, interaction.token).callback.post({
					data: {
						type: 4,
						data: {
							embeds: [{
								title: "Failed to locate any candidates.",
								type: "rich",
								color: WARNING_COLOR
							}]
						}
					}
				});
			}

			// Create output message.
			const data = {
				type: 4,
				data: {
					embeds: [{
						title: `Meme of the Day ${new Date().getMonth() + 1}/${new Date().getDate()}/${new Date().getFullYear()}`,
						type: "rich",
						color: SUCCESS_COLOR,
						description: bestMeme.message.content,
						url: bestMeme.message.url,
						fields: [
							{
								name: "Author",
								value: `${bestMeme.message.author}`,
								inline: true
							},
							{
								name: "Score",
								value: bestMeme.score,
								inline: true
							}
						]
					}]
				}
			}

			// Find attachments.
			const attachments = [];
			for (const word of bestMeme.message.content.split(/\s+/)) {
				if (word.startsWith("http")) { attachments.push(word); }
			}
			for (const attachment of bestMeme.message.attachments.values()) {
				attachments.push(attachment.url);
			}

			// Add attachments to output message.
			for (const attachment of attachments) {
				const embed = {
					title: "Attachment",
					type: "rich",
					url: attachment
				};

				[".png", ".jpg", ".jpeg", ".gif"].forEach((extension) => {
					if (attachment.endsWith(extension)) { embed.image = { url: attachment }; }
				});
				[".mp4", ".webm", ".mov"].forEach((extension) => {
					if (attachment.endsWith(extension)) { embed.video = { url: attachment }; }
				});

				data.data.embeds.push(embed);
			}

			return client.api.interactions(interaction.id, interaction.token).callback.post({ data });
	}
});

// Add reactions.
client.on("messageReactionAdd", async (reaction, user) => {
	if (user.bot) { return; }
	if (reaction.emoji.identifier != UPVOTE_IDENTIFIER && reaction.emoji.identifier != DOWNVOTE_IDENTIFIER) { return; }
	if (reaction.message.author?.bot) { return; }

	// Fetch the reaction message, in case it's a partial.
	try { await reaction.message.fetch(); } catch (error) { console.error(`Error fetching reaction message: ${error}`); }
	try {
		await reaction.message.guild.members.cache.find((member) => member.user == user).fetch();
	} catch (error) { console.error(`Error fetching reaction member: ${error}`); }

	reaction.message.react(UPVOTE_IDENTIFIER);
	reaction.message.react(DOWNVOTE_IDENTIFIER);
});

// Login.
client.login(process.env.TOKEN);