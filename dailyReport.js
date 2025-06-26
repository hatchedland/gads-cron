const { GoogleAdsApi } = require("google-ads-api");
const fs = require('fs');
require('dotenv').config();

const client = new GoogleAdsApi({
    client_id: process.env.OAUTH_CLIENT_ID,
    client_secret: process.env.OAUTH_SECRET,
    developer_token: process.env.DEVELOPER_TOKEN,
});

async function getCampaignMetrics( campaign ) {
    try {
        const customer = client.Customer({
            customer_id: 5256988497,
            refresh_token: process.env.REFRESH_TOKEN,
        });

            const campaignId = campaign.campaignId;
            const startDate = campaign.startDate.replace(/-/g, ''); // Format: YYYYMMDD
            let endDate = campaign.isPaused ? campaign.lastActiveDate.replace(/-/g, '') : campaign.endDate.replace(/-/g, ''); // Format: YYYYMMDD

            // If endDate is "No end date", use today's date
            if (campaign.endDate === "No end date") {
                const today = new Date();
                const year = today.getFullYear();
                let month = today.getMonth() + 1;
                let day = today.getDate();

                month = month < 10 ? '0' + month : month;
                day = day < 10 ? '0' + day : day;

                endDate = `${year}${month}${day}`;
            } else if (endDate.startsWith("Paused on ")) {
                endDate = endDate.substring("Paused on ".length);
            }


            // Build the query
            const query = `
                SELECT
                    campaign.id,
                    campaign.name,
                    segments.date,
                    metrics.clicks,
                    metrics.conversions,
                    metrics.cost_micros,
                    metrics.conversions_value,
                    metrics.impressions
                FROM campaign
                WHERE campaign.id = ${campaignId}
                AND segments.date BETWEEN "${startDate}" AND "${endDate}"
            `;

            console.log(`Executing query for campaign ${campaignId}...`);

            const response = await customer.query(query);

            for (const row of response) {
                console.log(
                    `Campaign ID: ${campaignId}, Date: ${row.segments.date}, Clicks: ${row.metrics.clicks}, Conversions: ${row.metrics.conversions}, Cost: ${row.metrics.cost_micros}`
                );
            }
            console.log(`Finished processing campaign ${campaignId}.`);
    

    } catch (error) {
        console.error("Request failed:", error);
    }
}

getCampaignMetrics();
