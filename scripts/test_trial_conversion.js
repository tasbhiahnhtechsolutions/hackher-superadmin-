import Stripe from 'stripe';
import dotenv from 'dotenv';
import readline from 'readline';

dotenv.config();

const stripeKey = process.env.STRIPE_SECRET_KEY;
if (!stripeKey) {
    console.error("❌ ERROR: STRIPE_SECRET_KEY is missing.");
    process.exit(1);
}

const stripe = new Stripe(stripeKey);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const askQuestion = (query) => new Promise(resolve => rl.question(query, resolve));

async function main() {
    console.log("======================================================");
    console.log("        STRIPE TRIAL CONVERSION TESTER                ");
    console.log("======================================================\n");

    const subId = process.argv[2];

    if (!subId) {
        console.error("❌ Please provide a Subscription ID!");
        console.error("👉 Example: bun run scripts/test_trial_conversion.js sub_1xxxxxxxx");
        process.exit(1);
    }

    try {
        console.log(`🔍 Fetching subscription: ${subId}`);
        const subscription = await stripe.subscriptions.retrieve(subId);

        console.log(`\n✅ Current Status: ${subscription.status.toUpperCase()}`);

        if (subscription.status !== 'trialing') {
            console.log(`⚠️ This subscription is not currently in a free trial. (Status: ${subscription.status})`);
            console.log(`   You can only end a trial if it is currently 'trialing'.`);
            process.exit(0);
        }

        console.log(`📅 Trial Ends At: ${new Date(subscription.trial_end * 1000).toLocaleString()}`);

        console.log(`\n======================================================`);
        console.log(`Stripe internally holds the first charge until the trial_end timestamp.`);
        console.log(`We can manually skip the trial period and FORCE charge it right now.`);
        console.log(`======================================================\n`);

        const answer = await askQuestion("⚡ Do you want to END THE TRIAL NOW and instantly charge the money? (y/n): ");

        if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
            console.log("\n🚀 Forcing the trial to end 'now'...");

            // By setting trial_end to "now", Stripe immediately finalizes the trial, creates an invoice, and bills the card.
            const updatedSub = await stripe.subscriptions.update(subId, {
                trial_end: 'now'
            });

            console.log(`\n✅ Trial ended successfully!`);
            console.log(`📅 New Status: ${updatedSub.status.toUpperCase()}`);
            console.log(`👉 The first invoice has been generated and your system will receive 'invoice.paid' webhook!`);
        } else {
            console.log("\n🛑 Exiting safely.");
        }

    } catch (error) {
        console.error("\n❌ Error:", error.message);
    } finally {
        rl.close();
    }
}

main();
