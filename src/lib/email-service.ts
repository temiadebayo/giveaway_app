import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = "Giveaway App <noreply@trygiveaway.app>";

export const emailService = {
    async sendKycApproved(to: string, displayName: string) {
        await resend.emails.send({
            from: FROM,
            to,
            subject: "Your KYC has been approved ✅",
            html: `
                <h2>Hi ${displayName},</h2>
                <p>Great news — your identity verification has been <strong>approved</strong>.</p>
                <p>Your trust score has been updated. You can now access higher withdrawal limits and host larger giveaways.</p>
                <p><a href="https://trygiveaway.app/dashboard">Go to Dashboard</a></p>
                <p>— The Giveaway App Team</p>
            `,
        });
    },

    async sendKycRejected(to: string, displayName: string, reason: string) {
        await resend.emails.send({
            from: FROM,
            to,
            subject: "KYC verification update",
            html: `
                <h2>Hi ${displayName},</h2>
                <p>Unfortunately, your identity verification was <strong>not approved</strong>.</p>
                <p><strong>Reason:</strong> ${reason}</p>
                <p>Please re-submit with clear, valid documents.</p>
                <p><a href="https://trygiveaway.app/settings">Re-submit KYC</a></p>
                <p>— The Giveaway App Team</p>
            `,
        });
    },

    async sendWithdrawalProcessed(to: string, displayName: string, amount: number, netAmount: number) {
        const fmt = (n: number) =>
            new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", minimumFractionDigits: 2 }).format(n);

        await resend.emails.send({
            from: FROM,
            to,
            subject: "Your withdrawal has been processed 💸",
            html: `
                <h2>Hi ${displayName},</h2>
                <p>Your withdrawal of <strong>${fmt(amount)}</strong> has been processed.</p>
                <p>Amount sent to your bank: <strong>${fmt(netAmount)}</strong> (after 5% fee).</p>
                <p>Please allow 1–3 business days for the funds to reflect in your account.</p>
                <p><a href="https://trygiveaway.app/wallet">View Wallet</a></p>
                <p>— The Giveaway App Team</p>
            `,
        });
    },

    async sendWithdrawalFailed(to: string, displayName: string, amount: number, reason: string) {
        const fmt = (n: number) =>
            new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", minimumFractionDigits: 2 }).format(n);

        await resend.emails.send({
            from: FROM,
            to,
            subject: "Withdrawal could not be processed",
            html: `
                <h2>Hi ${displayName},</h2>
                <p>We were unable to process your withdrawal of <strong>${fmt(amount)}</strong>.</p>
                <p><strong>Reason:</strong> ${reason}</p>
                <p>The funds have been returned to your wallet.</p>
                <p><a href="https://trygiveaway.app/wallet">View Wallet</a></p>
                <p>— The Giveaway App Team</p>
            `,
        });
    },

    async sendPrizeWon(to: string, displayName: string, prizeAmount: number, giveawayTitle: string, giveawayId: string) {
        const fmt = (n: number) =>
            new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", minimumFractionDigits: 0 }).format(n);

        await resend.emails.send({
            from: FROM,
            to,
            subject: `You won ${fmt(prizeAmount)}! 🎉`,
            html: `
                <h2>Congratulations ${displayName}! 🏆</h2>
                <p>You won <strong>${fmt(prizeAmount)}</strong> in <em>${giveawayTitle}</em>!</p>
                <p>Claim your prize now before it expires.</p>
                <p><a href="https://trygiveaway.app/giveaways/${giveawayId}">Claim Prize</a></p>
                <p>— The Giveaway App Team</p>
            `,
        });
    },
};
