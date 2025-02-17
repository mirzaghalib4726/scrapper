const puppeteer = require("puppeteer");
const fs = require("fs");
const { parse } = require("json2csv");
let link = 1;

// Function to normalize text (replace non-breaking spaces with regular spaces)
const normalizeText = (text) => {
  return text ? text.replace(/\xA0/g, " ") : text;
};

(async () => {
  // Launch the browser
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  // Array to store all scraped data
  let allData = [];

  // Array of URLs to scrape
  const urls = [
    "https://publicreg.myafsa.com/fintech",
    "https://publicreg.myafsa.com/dasp",
  ];

  // Function to scrape data from the main table
  const scrapeMainTable = async () => {
    await page.waitForSelector(".table-container");

    const data = await page.evaluate(() => {
      const rows = Array.from(
        document.querySelectorAll(".table-container .table tbody tr")
      );
      return rows.map((row) => {
        const columns = Array.from(row.querySelectorAll("td"));
        return {
          companyName: columns[0]?.innerText.trim(),
          licenseNumber: columns[1]?.innerText.trim(),
          licenseStatus: columns[2]?.innerText.trim(),
          licenseIssueDate: columns[3]?.innerText.trim(),
          orderedActivities: columns[4]?.innerText.trim(),
          detailsLink: columns[5]?.querySelector("a")?.href,
        };
      });
    });

    return data;
  };

  // Function to scrape data from the details page
  const scrapeDetailsPage = async (url) => {
    const detailsPage = await browser.newPage();
    await detailsPage.goto(url, { waitUntil: "networkidle2" });

    const linkData = await detailsPage.evaluate(() => {
      const table = document.querySelector(".table-boarded");
      if (!table) return null;

      const rows = Array.from(table.querySelectorAll("tbody tr"));
      return rows.map((row) => {
        const columns = Array.from(row.querySelectorAll("td"));
        return {
          subjectOfRegulation: columns[0]?.innerText.trim(),
          licenseNumber: columns[1]?.innerText.trim(),
          licenseActiveSince: columns[2]?.innerText.trim(),
          licenseNotActiveSince: columns[3]?.innerText.trim(),
          status: columns[4]?.innerText.trim(),
          activitiesServices: columns[5]?.innerText.trim(),
          description: columns[6]?.innerText.trim(),
          comments: columns[7]?.innerText.trim(),
        };
      });
    });

    await detailsPage.close();
    return linkData;
  };

  // Loop through each URL and scrape data
  for (const url of urls) {
    await page.goto(url, { waitUntil: "networkidle2" });

    // Scrape the main table data
    let mainTableData = await scrapeMainTable();
    allData = allData.concat(mainTableData);

    // Handle pagination

    let hasNextPage = true;
    while (hasNextPage) {
      const nextButton = await page.$(".pagination .next:not(.disabled)");
      if (nextButton) {
        await nextButton.click();
        await page.waitForNavigation({ waitUntil: "networkidle2" });

        mainTableData = await scrapeMainTable();
        allData = allData.concat(mainTableData);
      } else {
        hasNextPage = false;
      }
    }

    for (let entry of allData) {
      if (entry.detailsLink) {
        entry.linkData = await scrapeDetailsPage(entry.detailsLink);
      }
    }

    // Normalize all text fields
    const normalizedData = allData.map((entry) => {
      const linkData = entry.linkData ? entry.linkData[0] : {};
      const temp = normalizeText(linkData.activitiesServices);
      const data = temp.split(/\n-|-/).filter(Boolean).join(", ");
      return {
        companyName: normalizeText(entry.companyName),
        licenseNumber: normalizeText(entry.licenseNumber),
        licenseStatus: normalizeText(entry.licenseStatus),
        licenseIssueDate: normalizeText(entry.licenseIssueDate),
        orderedActivities: normalizeText(entry.orderedActivities),
        detailsLink: entry.detailsLink,
        subjectOfRegulation: normalizeText(linkData.subjectOfRegulation),
        licenseActiveSince: normalizeText(linkData.licenseActiveSince),
        licenseNotActiveSince: normalizeText(linkData.licenseNotActiveSince),
        status: normalizeText(linkData.status),
        activitiesServices: data || "",
        description: normalizeText(linkData.description),
        comments: normalizeText(linkData.comments),
      };
    });

    // Convert JSON to CSV
    const csv = parse(normalizedData, {
      fields: [
        "companyName",
        "licenseNumber",
        "licenseStatus",
        "licenseIssueDate",
        "orderedActivities",
        "detailsLink",
        "subjectOfRegulation",
        "licenseActiveSince",
        "licenseNotActiveSince",
        "status",
        "activitiesServices",
        "description",
        "comments",
      ],
    });

    // Save the CSV file
    fs.writeFileSync(`publicreg-link-${link}.csv`, csv);
    link++;
  }

  // Close the browser
  await browser.close();
})();
