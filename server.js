require("dotenv").config();

const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const nodemailer = require("nodemailer");
const PDFDocument = require("pdfkit");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const bookingLink = process.env.BOOKING_LINK || "https://example.com/book";
const publicDir = path.join(__dirname, "public");

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(publicDir));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many submissions from this device. Please wait a few minutes and try again."
  }
});

app.use("/api", apiLimiter);

function sanitizeText(value) {
  return String(value || "").trim();
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

function getEmailProvider() {
  return sanitizeText(process.env.EMAIL_PROVIDER || "smtp").toLowerCase();
}

function getLeadSyncProvider() {
  return sanitizeText(process.env.LEAD_SYNC_PROVIDER || "none").toLowerCase();
}

function calculateRevenue(data) {
  const totalCurrentCustomers = toNumber(data.totalCurrentCustomers);
  const averageOrderValue = toNumber(data.averageOrderValue);
  const purchaseFrequencyPerYear = toNumber(data.purchaseFrequencyPerYear);
  const currentRetentionRate = toNumber(data.currentRetentionRate) / 100;
  const projectedRetentionRate = toNumber(data.projectedRetentionRate) / 100;
  const upsellPercent = Math.max(0, toNumber(data.upsellPercent) || 0) / 100;
  const crossSellPercent = Math.max(0, toNumber(data.crossSellPercent) || 0) / 100;

  const currentYearlyRevenue =
    totalCurrentCustomers *
    currentRetentionRate *
    averageOrderValue *
    purchaseFrequencyPerYear;
  const projectedYearlyRevenueFromRetention =
    totalCurrentCustomers *
    projectedRetentionRate *
    averageOrderValue *
    purchaseFrequencyPerYear;
  const projectedYearlyUpsellCrossSellRevenue =
    totalCurrentCustomers *
    projectedRetentionRate *
    averageOrderValue *
    (upsellPercent + crossSellPercent) *
    purchaseFrequencyPerYear;
  const projectedYearlyRevenue =
    projectedYearlyRevenueFromRetention + projectedYearlyUpsellCrossSellRevenue;
  const extraYearlyRevenue =
    projectedYearlyRevenueFromRetention - currentYearlyRevenue;
  const extraMonthlyRevenueFromRetention = extraYearlyRevenue / 12;
  const extraMonthlyUpsellRevenue = projectedYearlyUpsellCrossSellRevenue / 12;
  const totalYearlyOpportunity = projectedYearlyRevenue - currentYearlyRevenue;
  const totalMonthlyOpportunity = totalYearlyOpportunity / 12;
  const currentMonthlyRevenue = currentYearlyRevenue / 12;

  return {
    currentYearlyRevenue,
    projectedYearlyRevenue,
    currentMonthlyRevenue,
    extraMonthlyRevenueFromRetention,
    extraYearlyRevenue,
    extraMonthlyUpsellRevenue,
    totalMonthlyOpportunity,
    totalYearlyOpportunity
  };
}

function buildAnalysis(data, results) {
  const businessName = sanitizeText(data.businessName);
  const currentRate = sanitizeText(data.currentRetentionRate);
  const projectedRate = sanitizeText(data.projectedRetentionRate);
  const upsellPercent = sanitizeText(data.upsellPercent);
  const crossSellPercent = sanitizeText(data.crossSellPercent);

  return [
    `${businessName} is currently generating about ${formatCurrency(results.currentYearlyRevenue)} per year from retained existing customers.`,
    `Improving retention from ${currentRate}% to ${projectedRate}% could add around ${formatCurrency(results.extraMonthlyRevenueFromRetention)} per month before upsell or cross-sell effects.`,
    results.extraMonthlyUpsellRevenue > 0
      ? `Adding projected upsell and cross-sell growth of ${upsellPercent || "0"}% and ${crossSellPercent || "0"}% could contribute another ${formatCurrency(results.extraMonthlyUpsellRevenue)} per month.`
      : "There is additional room to increase customer value by introducing upsell and cross-sell follow-up.",
    `That brings the total revenue opportunity to about ${formatCurrency(results.totalYearlyOpportunity)} per year.`
  ];
}

function buildEmailHtml(data, results) {
  return `
    <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6;">
      <div style="background: #0F172A; padding: 24px; color: white; border-radius: 16px 16px 0 0;">
        <h1 style="margin: 0; font-size: 24px;">Masters Integrity Marketing</h1>
        <p style="margin: 8px 0 0; color: #FEF3C7;">Customer Retention Revenue Report</p>
      </div>
      <div style="border: 1px solid #e5e7eb; border-top: 0; border-radius: 0 0 16px 16px; padding: 24px;">
        <p>Hi ${sanitizeText(data.contactName)},</p>
        <p>Attached is your Masters Integrity Marketing revenue opportunity report for <strong>${sanitizeText(data.businessName)}</strong>.</p>
        <div style="background: #f9fafb; border-radius: 12px; padding: 18px; margin: 20px 0;">
          <p style="margin: 0 0 8px;"><strong>Total monthly opportunity:</strong> ${formatCurrency(results.totalMonthlyOpportunity)}</p>
          <p style="margin: 0 0 8px;"><strong>Total yearly opportunity:</strong> ${formatCurrency(results.totalYearlyOpportunity)}</p>
          <p style="margin: 0;"><strong>Retention projection:</strong> ${sanitizeText(data.currentRetentionRate)}% to ${sanitizeText(data.projectedRetentionRate)}%</p>
        </div>
        <p>When you're ready, book your strategy call here:</p>
        <p><a href="${bookingLink}" style="color: #C6A55C;">${bookingLink}</a></p>
        <p style="margin-top: 24px;">Masters Integrity Marketing</p>
      </div>
    </div>
  `;
}

function buildEmailText(data, results) {
  return [
    `Hi ${data.contactName},`,
    "",
    `Attached is your Masters Integrity Marketing Customer Retention Revenue Report for ${data.businessName}.`,
    `Your estimated total monthly opportunity is ${formatCurrency(results.totalMonthlyOpportunity)}.`,
    `Your estimated total yearly opportunity is ${formatCurrency(results.totalYearlyOpportunity)}.`,
    "",
    `When you're ready, book your strategy call here: ${bookingLink}`,
    "",
    "Masters Integrity Marketing"
  ].join("\n");
}

function buildLeadPayload(data, results) {
  return {
    source: "mastersintegrity-retention-calculator",
    submittedAt: new Date().toISOString(),
    businessName: data.businessName,
    contactName: data.contactName,
    email: data.email,
    phone: data.phone,
    businessType: data.businessType,
    totalCurrentCustomers: data.totalCurrentCustomers,
    averageOrderValue: data.averageOrderValue,
    purchaseFrequencyPerYear: data.purchaseFrequencyPerYear,
    currentRetentionRate: data.currentRetentionRate,
    projectedRetentionRate: data.projectedRetentionRate,
    upsellPercent: data.upsellPercent,
    crossSellPercent: data.crossSellPercent,
    currentYearlyRevenue: results.currentYearlyRevenue,
    projectedYearlyRevenue: results.projectedYearlyRevenue,
    currentMonthlyRevenue: results.currentMonthlyRevenue,
    extraMonthlyRevenueFromRetention: results.extraMonthlyRevenueFromRetention,
    extraYearlyRevenue: results.extraYearlyRevenue,
    extraMonthlyUpsellRevenue: results.extraMonthlyUpsellRevenue,
    totalMonthlyOpportunity: results.totalMonthlyOpportunity,
    totalYearlyOpportunity: results.totalYearlyOpportunity,
    bookingLink
  };
}

function generatePdfBuffer(data, results) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 42 });
    const buffers = [];

    doc.on("data", (chunk) => buffers.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);

    const colors = {
      primary: "#C6A55C",
      dark: "#0F172A",
      orange: "#C6A55C",
      light: "#F9FAFB",
      green: "#16A34A",
      text: "#1F2937",
      muted: "#6B7280"
    };

    const businessName = sanitizeText(data.businessName);
    const contactName = sanitizeText(data.contactName);
    const projectedRetentionRate = sanitizeText(data.projectedRetentionRate);
    const analysis = buildAnalysis(data, results);
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const margin = doc.page.margins.left;
    const contentWidth = pageWidth - margin * 2;
    const gutter = 14;
    const cardWidth = (contentWidth - gutter) / 2;
    const cardHeight = 82;
    const sectionGap = 16;
    const lineGap = 3;
    const sectionPadding = 16;
    let currentY = margin;

    const ensureSpace = (heightNeeded) => {
      if (currentY + heightNeeded <= pageHeight - margin) {
        return;
      }

      doc.addPage();
      currentY = margin;
    };

    const drawMetricCard = (x, y, title, value, accent) => {
      doc.save();
      doc.roundedRect(x, y, cardWidth, cardHeight, 14).fillAndStroke("#FFFFFF", "#E5E7EB");
      doc.fillColor(accent).roundedRect(x, y, cardWidth, 8, 14).fill();
      doc.fillColor(colors.muted).fontSize(9).text(title, x + 14, y + 20, {
        width: cardWidth - 28
      });
      doc.fillColor(colors.text).fontSize(20).text(value, x + 14, y + 38, {
        width: cardWidth - 28
      });
      doc.restore();
    };

    const drawPanel = (title, lines, options = {}) => {
      const panelWidth = options.width || contentWidth;
      const x = options.x || margin;
      const titleFontSize = options.titleFontSize || 15;
      const bodyFontSize = options.bodyFontSize || 10.5;
      const textWidth = panelWidth - sectionPadding * 2;
      const bodyText = lines.map((line) => `- ${line}`).join("\n");
      const bodyHeight = doc.heightOfString(bodyText, {
        width: textWidth,
        lineGap
      });
      const panelHeight = 26 + sectionPadding + bodyHeight + sectionPadding;

      ensureSpace(panelHeight);

      doc.fillColor(colors.dark).fontSize(titleFontSize).text(title, x, currentY);
      doc.roundedRect(x, currentY + 24, panelWidth, panelHeight - 24, 14).fill(options.background || colors.light);
      doc.fillColor(colors.text).fontSize(bodyFontSize).text(bodyText, x + sectionPadding, currentY + 40, {
        width: textWidth,
        lineGap
      });

      currentY += panelHeight + sectionGap;
    };

    doc.rect(0, 0, pageWidth, 116).fill(colors.dark);
    doc.fillColor("#FFFFFF").fontSize(24).text("Masters Integrity Marketing", margin, 34);
    doc.fontSize(12).fillColor("#FEF3C7").text("Customer Retention Revenue Report", margin, 68);
    doc.fillColor(colors.orange).circle(pageWidth - margin - 18, 52, 18).fill();
    doc.fillColor("#FFFFFF").fontSize(10).text("ROI", pageWidth - margin - 27, 48, {
      width: 18,
      align: "center"
    });

    currentY = 132;

    const businessNameHeight = doc.heightOfString(businessName, {
      width: 300
    });
    doc.fillColor(colors.text).fontSize(21).text(businessName, margin, currentY, {
      width: 300
    });
    doc.fillColor(colors.muted).fontSize(11).text(`Prepared for ${contactName}`, margin, currentY + businessNameHeight + 6);
    doc.text(`Business type: ${sanitizeText(data.businessType)}`, margin, currentY + businessNameHeight + 24);

    doc.roundedRect(pageWidth - margin - 190, currentY - 2, 190, 58, 14).fill(colors.light);
    doc.fillColor(colors.dark).fontSize(10).text("Revenue Opportunity Snapshot", pageWidth - margin - 174, currentY + 10, {
      width: 158
    });
    doc.fillColor(colors.primary).fontSize(16).text(formatCurrency(results.totalYearlyOpportunity), pageWidth - margin - 174, currentY + 28, {
      width: 158
    });

    currentY += Math.max(businessNameHeight + 44, 72) + 18;

    ensureSpace(cardHeight * 2 + gutter + 12);
    drawMetricCard(margin, currentY, "Current Monthly Revenue", formatCurrency(results.currentMonthlyRevenue), colors.primary);
    drawMetricCard(margin + cardWidth + gutter, currentY, "Total Monthly Opportunity", formatCurrency(results.totalMonthlyOpportunity), colors.green);
    drawMetricCard(margin, currentY + cardHeight + gutter, "Extra Yearly Revenue", formatCurrency(results.totalYearlyOpportunity), colors.orange);
    drawMetricCard(margin + cardWidth + gutter, currentY + cardHeight + gutter, "Projected Retention Rate", `${projectedRetentionRate}%`, colors.dark);
    currentY += cardHeight * 2 + gutter + sectionGap;

    drawPanel("Revenue Summary", [
      `Retention opportunity: ${formatCurrency(results.extraMonthlyRevenueFromRetention)} per month`,
      `Upsell opportunity: ${formatCurrency(results.extraMonthlyUpsellRevenue)} per month`,
      `Projected yearly revenue: ${formatCurrency(results.projectedYearlyRevenue)}`,
      `Total yearly opportunity: ${formatCurrency(results.totalYearlyOpportunity)}`
    ]);

    drawPanel("Plain-English Analysis", analysis);

    drawPanel("Recommended Next Steps", [
      "Set up an automated follow-up campaign after each purchase or inquiry.",
      "Reconnect with past customers using reminders, check-ins, and timed offers.",
      "Introduce one clear upsell or cross-sell message during your follow-up flow.",
      "Book a strategy session to map the highest-value retention opportunities."
    ]);

    ensureSpace(86);
    doc.roundedRect(margin, currentY, contentWidth, 72, 14).fill(colors.dark);
    doc.fillColor("#FFFFFF").fontSize(14).text("Ready to turn this opportunity into real revenue?", margin + 18, currentY + 16);
    doc.fillColor("#FEF3C7").fontSize(10.5).text(bookingLink, margin + 18, currentY + 40, {
      width: contentWidth - 36,
      link: bookingLink,
      underline: true
    });

    doc.end();
  });
}

function validatePayload(body) {
  const requiredTextFields = [
    "businessName",
    "contactName",
    "email",
    "phone",
    "businessType"
  ];

  for (const field of requiredTextFields) {
    if (!sanitizeText(body[field])) {
      return `${field} is required.`;
    }
  }

  const email = sanitizeText(body.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "Please enter a valid email address.";
  }

  const numericFields = [
    "totalCurrentCustomers",
    "averageOrderValue",
    "purchaseFrequencyPerYear",
    "currentRetentionRate",
    "projectedRetentionRate"
  ];

  for (const field of numericFields) {
    if (!Number.isFinite(toNumber(body[field]))) {
      return `${field} must be a valid number.`;
    }
  }

  if (
    toNumber(body.totalCurrentCustomers) < 0 ||
    toNumber(body.averageOrderValue) < 0 ||
    toNumber(body.purchaseFrequencyPerYear) < 0
  ) {
    return "Customer volume, order value, and purchase frequency must be zero or greater.";
  }

  const currentRetentionRate = toNumber(body.currentRetentionRate);
  const projectedRetentionRate = toNumber(body.projectedRetentionRate);
  if (currentRetentionRate < 0 || currentRetentionRate > 100) {
    return "Current retention rate must be between 0 and 100.";
  }

  if (projectedRetentionRate < 0 || projectedRetentionRate > 100) {
    return "Projected retention rate must be between 0 and 100.";
  }

  if (projectedRetentionRate < currentRetentionRate) {
    return "Projected retention rate should be equal to or higher than the current retention rate.";
  }

  const upsellPercent = sanitizeText(body.upsellPercent);
  if (upsellPercent) {
    const value = toNumber(upsellPercent);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      return "Upsell percent must be between 0 and 100.";
    }
  }

  const crossSellPercent = sanitizeText(body.crossSellPercent);
  if (crossSellPercent) {
    const value = toNumber(crossSellPercent);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      return "Cross-sell percent must be between 0 and 100.";
    }
  }

  return null;
}

function createTransporter() {
  const requiredEnv = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "FROM_EMAIL"];
  const missing = requiredEnv.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

function hasSmtpConfig() {
  return ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "FROM_EMAIL"].every(
    (key) => Boolean(process.env[key])
  );
}

function hasResendConfig() {
  return Boolean(process.env.RESEND_API_KEY) && Boolean(process.env.FROM_EMAIL);
}

function isEmailConfigured() {
  const provider = getEmailProvider();

  if (provider === "smtp") {
    return hasSmtpConfig();
  }

  if (provider === "resend") {
    return hasResendConfig();
  }

  return false;
}

function hasWebhookLeadSyncConfig() {
  return Boolean(process.env.LEAD_SYNC_WEBHOOK_URL);
}

function isLeadSyncConfigured() {
  const provider = getLeadSyncProvider();

  if (provider === "none") {
    return true;
  }

  if (provider === "webhook") {
    return hasWebhookLeadSyncConfig();
  }

  if (provider === "clientforce") {
    return false;
  }

  return false;
}

function getEmailStatus() {
  const provider = getEmailProvider();

  if (provider === "smtp") {
    const missing = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "FROM_EMAIL"].filter(
      (key) => !process.env[key]
    );

    return {
      provider,
      ready: missing.length === 0,
      missing
    };
  }

  if (provider === "resend") {
    const missing = ["RESEND_API_KEY", "FROM_EMAIL"].filter((key) => !process.env[key]);

    return {
      provider,
      ready: missing.length === 0,
      missing
    };
  }

  return {
    provider,
    ready: false,
    missing: ["EMAIL_PROVIDER must be one of: smtp, resend"]
  };
}

function getLeadSyncStatus() {
  const provider = getLeadSyncProvider();

  if (provider === "none") {
    return {
      provider,
      ready: true,
      missing: []
    };
  }

  if (provider === "webhook") {
    const missing = ["LEAD_SYNC_WEBHOOK_URL"].filter((key) => !process.env[key]);

    return {
      provider,
      ready: missing.length === 0,
      missing
    };
  }

  if (provider === "clientforce") {
    return {
      provider,
      ready: false,
      missing: ["Clientforce direct API details are not configured yet. Use webhook mode for now."]
    };
  }

  return {
    provider,
    ready: false,
    missing: ["LEAD_SYNC_PROVIDER must be one of: none, webhook, clientforce"]
  };
}

async function sendWithSmtp(emailPayload) {
  const transporter = createTransporter();

  await transporter.sendMail({
    from: process.env.FROM_EMAIL,
    to: emailPayload.to,
    subject: emailPayload.subject,
    text: emailPayload.text,
    html: emailPayload.html,
    attachments: emailPayload.attachments
  });
}

async function sendWithResend(emailPayload) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: process.env.FROM_EMAIL,
      to: [emailPayload.to],
      subject: emailPayload.subject,
      text: emailPayload.text,
      html: emailPayload.html,
      attachments: emailPayload.attachments.map((attachment) => ({
        filename: attachment.filename,
        content: attachment.content.toString("base64")
      }))
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Resend error: ${response.status} ${errorText}`);
  }
}

async function sendReportEmail(emailPayload) {
  const provider = getEmailProvider();

  if (provider === "smtp") {
    await sendWithSmtp(emailPayload);
    return;
  }

  if (provider === "resend") {
    await sendWithResend(emailPayload);
    return;
  }

  throw new Error(`Unsupported EMAIL_PROVIDER "${provider}". Use "smtp" or "resend".`);
}

async function syncLeadWithWebhook(leadPayload) {
  const response = await fetch(process.env.LEAD_SYNC_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(leadPayload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Lead webhook error: ${response.status} ${errorText}`);
  }
}

async function syncLead(leadPayload) {
  const provider = getLeadSyncProvider();

  if (provider === "none") {
    return {
      synced: false,
      message: "Lead sync is disabled."
    };
  }

  if (provider === "webhook") {
    await syncLeadWithWebhook(leadPayload);
    return {
      synced: true,
      message: "Lead was sent to your webhook list destination."
    };
  }

  if (provider === "clientforce") {
    throw new Error("Clientforce direct API integration is not configured yet. Use LEAD_SYNC_PROVIDER=webhook for now.");
  }

  throw new Error(`Unsupported LEAD_SYNC_PROVIDER "${provider}". Use "none", "webhook", or "clientforce".`);
}

app.get("/api/config", (req, res) => {
  res.json({ bookingLink });
});

app.post("/api/calculate", async (req, res) => {
  try {
    const validationError = validatePayload(req.body);

    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const cleanData = {
      businessName: sanitizeText(req.body.businessName),
      contactName: sanitizeText(req.body.contactName),
      email: sanitizeText(req.body.email),
      phone: sanitizeText(req.body.phone),
      businessType: sanitizeText(req.body.businessType),
      totalCurrentCustomers: toNumber(req.body.totalCurrentCustomers),
      averageOrderValue: toNumber(req.body.averageOrderValue),
      purchaseFrequencyPerYear: toNumber(req.body.purchaseFrequencyPerYear),
      currentRetentionRate: toNumber(req.body.currentRetentionRate),
      projectedRetentionRate: toNumber(req.body.projectedRetentionRate),
      upsellPercent: sanitizeText(req.body.upsellPercent) ? toNumber(req.body.upsellPercent) : 0,
      crossSellPercent: sanitizeText(req.body.crossSellPercent) ? toNumber(req.body.crossSellPercent) : 0
    };

    const results = calculateRevenue(cleanData);
    const pdfBuffer = await generatePdfBuffer(cleanData, results);
    const leadPayload = buildLeadPayload(cleanData, results);
    let emailSent = false;
    let emailMessage = "Email delivery is not configured, so the report was generated but not emailed.";
    let leadSynced = false;
    let leadSyncMessage = "Lead sync is disabled.";

    const emailPayload = {
      to: cleanData.email,
      subject: `Your Masters Integrity Marketing Revenue Opportunity Report, ${cleanData.contactName}`,
      text: buildEmailText(cleanData, results),
      html: buildEmailHtml(cleanData, results),
      attachments: [
        {
          filename: "mastersintegrity-revenue-report.pdf",
          content: pdfBuffer
        }
      ]
    };

    if (isEmailConfigured()) {
      await sendReportEmail(emailPayload);
      emailSent = true;
      emailMessage = `Your PDF report was emailed to ${cleanData.email}.`;
    } else {
      console.warn("Email provider variables are missing. Skipping email delivery and returning calculator results only.");
    }

    if (isLeadSyncConfigured()) {
      try {
        const leadSyncResult = await syncLead(leadPayload);
        leadSynced = leadSyncResult.synced;
        leadSyncMessage = leadSyncResult.message;
      } catch (leadError) {
        console.error("Lead sync failed:", leadError);
        leadSynced = false;
        leadSyncMessage = "Your report was delivered, but prospect list syncing did not complete.";
      }
    } else {
      console.warn("Lead sync provider variables are missing or invalid. Skipping prospect sync.");
      leadSyncMessage = "Lead sync is not configured.";
    }

    return res.json({
      success: true,
      emailSent,
      emailMessage,
      leadSynced,
      leadSyncMessage,
      results: {
        currentMonthlyRevenue: formatCurrency(results.currentMonthlyRevenue),
        extraMonthlyRevenueFromRetention: formatCurrency(results.extraMonthlyRevenueFromRetention),
        extraYearlyRevenue: formatCurrency(results.extraYearlyRevenue),
        extraMonthlyUpsellRevenue: formatCurrency(results.extraMonthlyUpsellRevenue),
        totalMonthlyOpportunity: formatCurrency(results.totalMonthlyOpportunity),
        totalYearlyOpportunity: formatCurrency(results.totalYearlyOpportunity)
      }
    });
  } catch (error) {
    console.error("Calculation request failed:", error);

    if (error && error.message && error.message.includes("Lead sync")) {
      return res.status(200).json({
        success: true,
        emailSent: true,
        emailMessage: "Your PDF report was emailed successfully.",
        leadSynced: false,
        leadSyncMessage: "Your report was delivered, but prospect list syncing did not complete."
      });
    }

    return res.status(500).json({
      error: "We couldn't send your report right now. Please try again in a moment."
    });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.get("/offer", (req, res) => {
  res.sendFile(path.join(publicDir, "offer.html"));
});

function logStartupStatus() {
  const emailStatus = getEmailStatus();
  const leadSyncStatus = getLeadSyncStatus();

  console.log(`Masters Integrity Marketing calculator listening on http://localhost:${PORT}`);

  if (emailStatus.ready) {
    console.log(`Email status: configured for provider "${emailStatus.provider}".`);
  } else {
    console.warn(
      `Email status: provider "${emailStatus.provider}" is not ready. Missing or invalid: ${emailStatus.missing.join(", ")}.`
    );
  }

  if (leadSyncStatus.ready) {
    console.log(`Lead sync status: configured for provider "${leadSyncStatus.provider}".`);
  } else {
    console.warn(
      `Lead sync status: provider "${leadSyncStatus.provider}" is not ready. Missing or invalid: ${leadSyncStatus.missing.join(", ")}.`
    );
  }
}

if (require.main === module) {
  const server = app.listen(PORT, () => {
    logStartupStatus();
  });

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(
        `Port ${PORT} is already in use. Stop the other server process or run this app with a different PORT value in your .env file.`
      );
      process.exit(1);
    }

    console.error("Server failed to start:", error);
    process.exit(1);
  });
}

module.exports = app;


