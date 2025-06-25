const { GoogleAdsApi } = require("google-ads-api");
require('dotenv').config();

const client = new GoogleAdsApi({
  client_id: process.env.OAUTH_CLIENT_ID,
  client_secret: process.env.OAUTH_SECRET,
  developer_token: process.env.DEVELOPER_TOKEN,
});

async function getCampaignMetrics() {
  try {
    const customer = client.Customer({
      customer_id: 5256988497,
      refresh_token: process.env.REFRESH_TOKEN,
    });

    const campaignId = "22567944376";
    const startDate = "20250516";
    const endDate = "20250529";
    const dateRange = `${startDate},${endDate}`;

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

    const response = await customer.query(query);

    for (const row of response) {
      console.log(
        `Date: ${row.segments.date}, Clicks: ${row.metrics.clicks}, Conversions: ${row.metrics.conversions}, Cost: ${row.metrics.cost_micros}`
      );
    }
  } catch (error) {
    console.error("Request failed:", error);
  }
}

getCampaignMetrics();
