'use strict';
// Single source of truth for the enquiry form's choices. Used by the contact page AND by the API,
// so the server only accepts values the form actually offers.
// These are static require() calls so Vercel bundles the JSON files with the serverless function.
const services = require('../content/services.json');
const cfg = require('../site.config.json');

const SERVICE_OPTIONS = [
  ...services.map((s) => [s.slug, s.title]),
  ...(cfg.training && cfg.training.enabled ? [['training', 'Training: Java Full Stack']] : []),
  ['other', 'Something else']
];

const BUDGETS = ['Under ₹25,000', '₹25,000 to ₹50,000', '₹50,000 to ₹1,00,000', '₹1,00,000 to ₹3,00,000', 'Above ₹3,00,000', 'Not sure yet'];

module.exports = { SERVICE_OPTIONS, BUDGETS };
