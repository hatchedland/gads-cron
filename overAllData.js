const { GoogleAdsApi } = require('google-ads-api');
require('dotenv').config();

/**
 * Get detailed campaign data with active duration metrics (start to pause date)
 * For paused campaigns: shows metrics only for the period they were active
 * For active campaigns: shows metrics from start to current date
 * @param {string} customerId - Google Ads customer ID (without dashes)
 * @param {string} dateRange - Optional date range for the report (e.g., 'LAST_30_DAYS', 'THIS_MONTH', 'CUSTOM')
 * @param {string} startDate - Start date in YYYY-MM-DD format (required if dateRange is 'CUSTOM')
 * @param {string} endDate - End date in YYYY-MM-DD format (required if dateRange is 'CUSTOM')
 * @returns {Promise<Array>} Array of campaign data objects with active duration metrics
 */
async function getCampaignData(customerId, dateRange = null, startDate = null, endDate = null) {
  try {
    // Initialize Google Ads API client
    const client = new GoogleAdsApi({
      client_id: process.env.OAUTH_CLIENT_ID,
      client_secret: process.env.OAUTH_SECRET,
      developer_token: process.env.DEVELOPER_TOKEN,
    });

    // Get customer instance
    const customer = client.Customer({
      customer_id: customerId,
      refresh_token: process.env.REFRESH_TOKEN,
    });

    // First, get campaign basic info and status
    const campaignInfoQuery = `
      SELECT 
        campaign.id,
        campaign.name,
        campaign.start_date,
        campaign.end_date,
        campaign.status
      FROM campaign 
      WHERE campaign.status != 'REMOVED'
      ORDER BY campaign.name ASC
    `;

    console.log('Executing campaign info query...');

    const campaignInfoResult = await customer.query(campaignInfoQuery);
    
    console.log(`Found ${campaignInfoResult.length} campaigns. Getting detailed metrics...`);
    
    // For each campaign, get detailed metrics with date segmentation to find last active date
    const campaignMap = new Map();
    
    for (const campaignRow of campaignInfoResult) {
      const campaignId = campaignRow.campaign.id;
      const campaignInfo = {
        id: campaignId,
        name: campaignRow.campaign.name,
        startDate: campaignRow.campaign.start_date,
        endDate: campaignRow.campaign.end_date,
        status: campaignRow.campaign.status,
        isPaused: parseInt(campaignRow.campaign.status) === 3
      };

      // Get historical data with date segmentation to find active period
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
      const metricsQuery = `
        SELECT 
          campaign.id,
          segments.date,
          metrics.cost_micros,
          metrics.conversions,
          metrics.conversions_value,
          metrics.impressions,
          metrics.clicks
        FROM campaign 
        WHERE campaign.id = ${campaignId}
          AND segments.date >= '${campaignInfo.startDate}'
          AND segments.date <= '${today}'
        ORDER BY segments.date ASC
      `;

      try {
        const metricsResult = await customer.query(metricsQuery);
        
        let totalCost = 0;
        let totalConversions = 0;
        let totalConversionsValue = 0;
        let totalImpressions = 0;
        let totalClicks = 0;
        let lastActiveDate = campaignInfo.startDate;
        let activeDays = 0;

        // Process daily metrics to find last active date and calculate totals
        metricsResult.forEach(row => {
          const cost = parseInt(row.metrics.cost_micros) || 0;
          const conversions = parseFloat(row.metrics.conversions) || 0;
          const conversionsValue = parseFloat(row.metrics.conversions_value) || 0;
          const impressions = parseInt(row.metrics.impressions) || 0;
          const clicks = parseInt(row.metrics.clicks) || 0;
          const date = row.segments.date;

          // If there's any activity (cost, impressions, or clicks), consider it active
          if (cost > 0 || impressions > 0 || clicks > 0) {
            lastActiveDate = date;
          }

          totalCost += cost;
          totalConversions += conversions;
          totalConversionsValue += conversionsValue;
          totalImpressions += impressions;
          totalClicks += clicks;
        });

        // Calculate active duration
        const startDateObj = new Date(campaignInfo.startDate);
        const endDateObj = campaignInfo.isPaused ? new Date(lastActiveDate) : new Date();
        activeDays = Math.ceil((endDateObj - startDateObj) / (1000 * 60 * 60 * 24)) + 1;

        campaignMap.set(campaignId, {
          ...campaignInfo,
          lastActiveDate: lastActiveDate,
          activeDays: activeDays,
          totalCost: totalCost,
          totalConversions: totalConversions,
          totalConversionsValue: totalConversionsValue,
          totalImpressions: totalImpressions,
          totalClicks: totalClicks
        });

      } catch (error) {
        console.warn(`Could not get metrics for campaign ${campaignId}:`, error.message);
        // Add campaign with zero metrics if metrics query fails
        campaignMap.set(campaignId, {
          ...campaignInfo,
          lastActiveDate: campaignInfo.startDate,
          activeDays: 1,
          totalCost: 0,
          totalConversions: 0,
          totalConversionsValue: 0,
          totalImpressions: 0,
          totalClicks: 0
        });
      }
    }

    const campaigns = Array.from(campaignMap.values());
    // Helper function to format end date (handle Google's default far-future dates)
    const formatEndDate = (endDate, isPaused, lastActiveDate) => {
      if (isPaused) {
        return `Paused on ${lastActiveDate}`;
      }
      
      if (!endDate) return 'No end date';
      
      // Google Ads uses far-future dates like 2037-12-30 for campaigns without end dates
      const endYear = parseInt(endDate.split('-')[0]);
      const currentYear = new Date().getFullYear();
      
      // If end date is more than 10 years in the future, treat as no end date
      if (endYear > currentYear + 10) {
        return 'No end date';
      }
      
      return endDate;
    };

    // Helper function to format campaign status (handles both string and numeric codes)
    const formatStatus = (status, isPaused, activeDays) => {
      let statusText = '';
      
      // Handle numeric status codes
      if (typeof status === 'number' || !isNaN(status)) {
        const numericStatus = parseInt(status);
        switch (numericStatus) {
          case 2: statusText = 'Active'; break;
          case 3: statusText = 'Paused'; break;
          case 4: statusText = 'Removed'; break;
          case 5: statusText = 'Draft'; break;
          case 6: statusText = 'Ended'; break;
          default: statusText = `Unknown (${status})`;
        }
      } else {
        // Handle string status codes (fallback)
        switch (status) {
          case 'ENABLED': statusText = 'Active'; break;
          case 'PAUSED': statusText = 'Paused'; break;
          case 'REMOVED': statusText = 'Removed'; break;
          case 'DRAFT': statusText = 'Draft'; break;
          case 'ENDED': statusText = 'Ended'; break;
          case 'UNKNOWN': statusText = 'Unknown'; break;
          default: statusText = status;
        }
      }
      
      // Add duration info for paused campaigns
      if (isPaused) {
        statusText += ` (Ran for ${activeDays} days)`;
      }
      
      return statusText;
    };

    // Format the final data
    const formattedCampaigns = campaigns.map(campaign => {
      const costInCurrency = campaign.totalCost / 1000000;
      const averageCpc = campaign.totalClicks > 0 ? costInCurrency / campaign.totalClicks : 0;
      const dailyAvgCost = campaign.activeDays > 0 ? costInCurrency / campaign.activeDays : 0;
      
      return {
        campaignId: campaign.id,
        campaignName: campaign.name,
        startDate: campaign.startDate,
        endDate: formatEndDate(campaign.endDate, campaign.isPaused, campaign.lastActiveDate),
        status: formatStatus(campaign.status, campaign.isPaused, campaign.activeDays),
        activeDuration: `${campaign.activeDays} days`,
        totalCost: costInCurrency.toFixed(2),
        dailyAvgCost: dailyAvgCost.toFixed(2),
        totalConversions: campaign.totalConversions.toFixed(2),
        totalConversionsValue: campaign.totalConversionsValue.toFixed(2),
        totalImpressions: campaign.totalImpressions,
        totalClicks: campaign.totalClicks,
        ctr: campaign.totalImpressions > 0 ? ((campaign.totalClicks / campaign.totalImpressions) * 100).toFixed(2) + '%' : '0%',
        averageCpc: averageCpc.toFixed(2),
        costPerDay: dailyAvgCost.toFixed(2),
        isPaused: campaign.isPaused,
        lastActiveDate: campaign.lastActiveDate
      };
    });

    return formattedCampaigns;

  } catch (error) {
    console.error('Error fetching campaign data:', error);
    throw error;
  }
}

/**
 * Get overall campaign data with active duration metrics (start to pause/current)
 * @param {string} customerId - Google Ads customer ID
 * @returns {Promise<Array>} Campaign data array with active duration metrics
 */
async function getOverallCampaignData(customerId) {
  return await getCampaignData(customerId);
}

/**
 * Get campaign data for a specific date range
 * @param {string} customerId - Google Ads customer ID
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Array>} Campaign data array
 */
async function getCampaignDataCustomRange(customerId, startDate, endDate) {
  return await getCampaignData(customerId, 'CUSTOM', startDate, endDate);
}

/**
 * Get campaign data for predefined ranges
 * @param {string} customerId - Google Ads customer ID
 * @param {string} range - Predefined range ('LAST_7_DAYS', 'LAST_30_DAYS', 'THIS_MONTH', 'LAST_MONTH', etc.)
 * @returns {Promise<Array>} Campaign data array
 */
async function getCampaignDataPredefined(customerId, range) {
  return await getCampaignData(customerId, range);
}

// Example usage function
async function example() {
  try {
    const customerId = '5256988497'; // Your Google Ads customer ID
    
    console.log('Fetching campaign active duration data...');
    
    // Get overall campaign data with active duration metrics - DEFAULT BEHAVIOR
    const campaigns = await getOverallCampaignData(customerId);
    
    console.log('\n=== OVERALL CAMPAIGN PERFORMANCE REPORT ===\n');
    
    campaigns.forEach((campaign, index) => {
      console.log(`${index + 1}. ${campaign.campaignName} (ID: ${campaign.campaignId})`);
      console.log(`   Start Date: ${campaign.startDate}`);
      console.log(`   End Date: ${campaign.endDate}`);
      console.log(`   Total Cost: ${campaign.totalCost}`);
      console.log(`   Total Conversions: ${campaign.totalConversions}`);
      console.log(`   Conversion Value: ${campaign.totalConversionsValue}`);
      console.log(`   Impressions: ${campaign.totalImpressions}`);
      console.log(`   Clicks: ${campaign.totalClicks}`);
      console.log(`   CTR: ${campaign.ctr}`);
      console.log(`   Avg CPC: ${campaign.averageCpc}`);
      console.log(`   Status: ${campaign.status}`);
      console.log('   ' + '-'.repeat(50));
    });

    // Calculate totals
    const totalCost = campaigns.reduce((sum, c) => sum + parseFloat(c.totalCost), 0);
    const totalConversions = campaigns.reduce((sum, c) => sum + parseFloat(c.totalConversions), 0);
    const totalConversionsValue = campaigns.reduce((sum, c) => sum + parseFloat(c.totalConversionsValue), 0);

    console.log('\n=== SUMMARY ===');
    console.log(`Total Campaigns: ${campaigns.length}`);
    console.log(`Total Cost: $${totalCost.toFixed(2)}`);
    console.log(`Total Conversions: ${totalConversions.toFixed(2)}`);
    console.log(`Total Conversion Value: $${totalConversionsValue.toFixed(2)}`);

  } catch (error) {
    console.error('Error in example:', error.message);
  }
}

module.exports = {
  getCampaignData,
  getOverallCampaignData,
  getCampaignDataCustomRange,
  getCampaignDataPredefined,
  example
};

// Uncomment to run the example
example();