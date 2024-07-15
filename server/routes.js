const crypto = require("crypto");
const OpenAI = require("openai");
const openai = new OpenAI({ apiKey: "REDACTED"});
const { Client, Environment } = require('square');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const SANDBOX_ACCESS_TOKEN = "REDACTED";
const SANDBOX_LOCATION_ID = "REDACTED";
const PRODUCTION_ACCESS_TOKEN = "REDACTED";
const PRODUCTION_LOCATION_ID  ="REDACTED"
const PRICE = {
    "Custom Graphic T-shirt": 1999
}

// Initialize the Square client
const squareClient = new Client({
    environment: Environment.Production, // Use Environment.Sandbox for test transactions
    accessToken: PRODUCTION_ACCESS_TOKEN,
});

// ip visits
const MAX_DAILY_REQUESTS = 10;
const ipFreq = { // initialize whitelists
    "24.5.142.251": -1, // Purple palace
};

function visit(ip) {
    if (ipFreq[ip] != undefined) {
        if (ipFreq[ip] >= MAX_DAILY_REQUESTS) {
            return false;
        } else if (ipFreq[ip] != -1) {
            ipFreq[ip]++;
        }
    } else {
        ipFreq[ip] = 1;
    }
    return true;
}

function resetFreq() {
    ipFreq = {};
}

// GET /home
const home = async function(req, res) {
    res.send("Welcome to the server!");
}

/**
 * Who is it for?
Check box for wanting it to be incorporated into the design
What do they like?
What occasion is this for? 
What are other must haves? 
Select an art style: 
Vintage
Modern
Graffiti
Pop Art
 */

// GET /generate_image
const generate_image = async function(req, res) {
    /** create prompt */
    log = new Date().toUTCString() + "\n";
    log = log + "generate_image called" + "\n";
    target = req.query.target == "" ? "someone" : req.query.target;
    interests = req.query.interests == "" ? req.query.interests : " who likes " + req.query.interests;
    occasion = req.query.occasion == "" ? "" : "It is for a " + req.query.occasion + ". ";
    objects = req.query.objects == "" ? "" : "It must contain " + req.query.objects + ". ";
    colors = req.query.colors == "" ? "any colors" : req.query.colors;
    style = req.query.style == "" ? "any" : req.query.style;
    image_prompt = "I NEED to test how the tool works with extremely simple prompts. DO NOT add any detail, just use it AS-IS: Design a artwork for " + target + interests + ". " + occasion + objects
        + " Use " + colors + ". "
    if (style === "Photorealistic") {
        image_prompt = image_prompt + "Use a photorealistic style to mimic the appearance of the real world. "
    } else if (style === "Oil Painting") {
        image_prompt = image_prompt + "Use a classical oil-painting style, emphasizing order, beauty, and harmony. "
    } else if (style === "Minimalist") {
        image_prompt = image_prompt + "Use an minimalist art style, emphasizing rich colors, bold shapes, and elegance. "
    } else if (style === "Graffiti") {
        image_prompt = image_prompt + "Use a graffiti art style, marked by vibrant colors and spray paint. "
    } else if (style === "Cartoon") {
        image_prompt = image_prompt + "Use a cartoon art style, with simple figures to appeal to a young audience. "
    } else if (style === "Sketch") {
        image_prompt = image_prompt + "Use a sketch art style, with light colors, thin lines, and a draft-like apearance. "
    } else if (style === "Black and White") {
        image_prompt = image_prompt + "Use a black-and-white art style, using darker tones to emphasize mysteriousness. "
    }
    if (req.query.targetIsUsed === "true") {
        image_prompt = image_prompt + " Include " + target + " in the design."
    }
    log = log + "Query: " + JSON.stringify(req.query) + "\n";
    log = log + "Prompt: " + image_prompt + "\n"

    /** restrict too many generations */
    // get IP address using x-forwarded-for header (useful when behind a proxy)
    const forwardedIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    if (visit(forwardedIp)) {
        log = log +  "Valid. IP: " + forwardedIp + " Frequency: " + ipFreq[forwardedIp] + "\n"
    } else {
        log = "Too many requests. IP: " + forwardedIp + "\n";
        fs.appendFile('log.txt', log, (err) => {
            if (err) throw err;
        })
        res.send({image_url: "too many requests"});
        return;
    }

    // costless route testing
    // res.send({prompt: "a rocket", image_url: "https://upload.wikimedia.org/wikipedia/commons/5/50/Average_propulsive_efficiency_of_rockets.png"});

    const response = await openai.images.generate({
        model: "dall-e-3",
        prompt: image_prompt,
        n: 1,
        size: "1024x1024",
    });

    /** save image */
    const imageKey = crypto.randomBytes(20).toString('hex');
    const savePath = path.resolve(__dirname, 'generatedImages/' + imageKey + '.png');
    // Ensure the downloads directory exists
    const downloadsDir = path.dirname(savePath);
    if (!fs.existsSync(downloadsDir)) {
        fs.mkdirSync(downloadsDir, { recursive: true });
    }
    downloadImage(response.data[0].url, savePath);

    log = log + "Response: " + JSON.stringify(response.data[0]) + "\n";
    fs.appendFile('log.txt', log, (err) => {
        if (err) throw err;
    })
    res.send({prompt: response.data[0].revised_prompt, image_url: response.data[0].url});
}

// TODO: implementation assumes catalog image object; requires file implementation but fails demanding multipart/form-data
async function createCatalogImage(imageURL, prompt, orderId) {
    try {
        // Step 1: Upload the image
        const imageResponse = await squareClient.catalogApi.createCatalogImage({
            idempotencyKey: crypto.randomBytes(20).toString('hex'),
            objectId: orderId,
            image: {
                type: 'IMAGE',
                id: '#TEMP_ID',
                imageData: {
                caption: prompt,
                url: imageURL,
            },
        },
    });
  
    console.log(imageResponse.result);
    } catch (error) {
      console.error('Error creating catalog item:', error);
    }
}

async function downloadImage(imageUrl, savePath) {
    try {
        const response = await axios({
            url: imageUrl,
            responseType: 'stream',
        });
  
        const writer = fs.createWriteStream(savePath);
  
        response.data.pipe(writer);
  
        return new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
    } catch (error) {
        console.error('Error downloading image:', error);
    }
}

// POST checkout
const checkout = async (req, res) => {
    log = new Date().toUTCString() + "\n";
    log = log + "checkout called" + "\n";
    const { sourceId, amount } = req.body;
    log = log + "Query: " + JSON.stringify(req.query) + "\n";;

    const orderKey = crypto.randomBytes(20).toString('hex');
  
    try {
        const requestBody = {
            idempotencyKey: orderKey,
            order: {
                locationId: PRODUCTION_LOCATION_ID,
                lineItems: [{
                    name: req.query.productName,
                    quantity: req.query.quantity,
                    note: orderKey,
                    variationName: req.query.shirtStyle + " " + req.query.shirtColor + " " + req.query.shirtSize,
                    basePriceMoney: {
                        amount: PRICE["Custom Graphic T-shirt"],
                        currency: 'USD'
                    }
                }],
                pricingOptions: {
                    autoApplyTaxes: true
                }
            },
            checkoutOptions: {
                allowTipping: false,
                askForShippingAddress: true,
                shippingFee: {
                    name: 'Standard Shipping',
                    charge: {
                      amount: 0,
                      currency: 'USD'
                    }
                  },
                enableCoupon: true,
                enableLoyalty: false,
                redirectUrl: "https://rochellelabs.com/complete"
              }
        }

        const response = await squareClient.checkoutApi.createPaymentLink(requestBody);

        // log = log + "Response result: " + JSON.stringify(response.result) + "\n";
        // createCatalogImage(req.query.imageURL, req.query.prompt, response.result.paymentLink.orderId);

        const savePath = path.resolve(__dirname, 'imageOrders/' + orderKey + '.png');
        // Ensure the downloads directory exists
        const downloadsDir = path.dirname(savePath);
        if (!fs.existsSync(downloadsDir)) {
            fs.mkdirSync(downloadsDir, { recursive: true });
        }
        downloadImage(req.query.imageURL, savePath)
        .then(() => {
            console.log('Image downloaded and saved successfully.');
        }).catch((error) => {
            console.error('Error saving image:', error);
        });

        // log = log + "Response: " + JSON.stringify(response.data[0]) + "\n";
        fs.appendFile('log.txt', log, (err) => {
            if (err) throw err;
        })
        res.send({paymentLinkURL: response.result.paymentLink.url});
    } catch(error) {
        console.log(error);
    }
}

module.exports = {
    resetFreq,
    home,
    generate_image,
    checkout
}