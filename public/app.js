// API base URL - will be automatically set to current domain in production
const API_BASE = window.location.origin;

// Auto-uppercase country codes
document.querySelectorAll('input[id*="Country"]').forEach(input => {
    input.addEventListener('input', (e) => {
        e.target.value = e.target.value.toUpperCase();
    });
});

// Health check
async function checkHealth() {
    try {
        const response = await fetch(`${API_BASE}/health`);
        const data = await response.json();
        
        const statusDot = document.getElementById('statusDot');
        const statusText = document.getElementById('statusText');
        const healthDetails = document.getElementById('healthDetails');
        
        if (data.healthy) {
            statusDot.style.background = '#22c55e';
            statusText.textContent = 'Healthy';
            healthDetails.innerHTML = `
                <div style="font-size: 0.9rem; color: #666;">
                    <div><strong>${data.stats.total_records.toLocaleString()}</strong> records</div>
                    <div><strong>${data.stats.countries}</strong> countries</div>
                    <div><strong>${data.responseTime}ms</strong> response</div>
                </div>
            `;
        } else {
            statusDot.style.background = '#ef4444';
            statusText.textContent = 'Unhealthy';
            healthDetails.textContent = 'API is not responding properly';
        }
    } catch (error) {
        const statusDot = document.getElementById('statusDot');
        const statusText = document.getElementById('statusText');
        const healthDetails = document.getElementById('healthDetails');
        
        statusDot.style.background = '#ef4444';
        statusText.textContent = 'Offline';
        healthDetails.textContent = 'Cannot connect to API';
    }
}

// Quick search
async function performSearch() {
    const country = document.getElementById('searchCountry').value.trim();
    const postalCode = document.getElementById('searchPostal').value.trim();
    const fuzzy = document.getElementById('fuzzySearch').checked;
    const resultDiv = document.getElementById('searchResult');
    
    if (!country || !postalCode) {
        showResult(resultDiv, 'Please enter both country code and postal code', 'error');
        return;
    }
    
    showResult(resultDiv, 'Searching...', 'loading');
    
    try {
        const response = await fetch(`${API_BASE}/lookup?country=${country}&postalCode=${encodeURIComponent(postalCode)}&fuzzy=${fuzzy}`);
        const data = await response.json();
        showResult(resultDiv, JSON.stringify(data, null, 2), response.ok ? 'success' : 'error');
    } catch (error) {
        showResult(resultDiv, `Error: ${error.message}`, 'error');
    }
}

// Autocomplete suggestions
let suggestTimeout;
async function getSuggestions() {
    clearTimeout(suggestTimeout);
    suggestTimeout = setTimeout(async () => {
        const country = document.getElementById('suggestCountry').value.trim();
        const partial = document.getElementById('suggestPartial').value.trim();
        const suggestionsDiv = document.getElementById('suggestions');
        const resultDiv = document.getElementById('suggestResult');
        
        if (!country || !partial || partial.length < 2) {
            suggestionsDiv.style.display = 'none';
            return;
        }
        
        try {
            const response = await fetch(`${API_BASE}/suggest?country=${country}&partial=${encodeURIComponent(partial)}&limit=10`);
            const data = await response.json();
            
            if (data.success && data.suggestions.length > 0) {
                suggestionsDiv.innerHTML = data.suggestions.map(item => 
                    `<div class="suggestion-item" data-postal="${item.postal_code}" data-country="${country}">
                        <strong>${item.postal_code}</strong> - ${item.place_name}, ${item.admin_name1}
                    </div>`
                ).join('');
                
                // Add event listeners to suggestion items
                suggestionsDiv.querySelectorAll('.suggestion-item').forEach(item => {
                    item.addEventListener('click', () => {
                        selectSuggestion(item.dataset.postal, item.dataset.country);
                    });
                });
                
                suggestionsDiv.style.display = 'block';
                showResult(resultDiv, JSON.stringify(data, null, 2), 'success');
            } else {
                suggestionsDiv.style.display = 'none';
                showResult(resultDiv, 'No suggestions found', 'error');
            }
        } catch (error) {
            suggestionsDiv.style.display = 'none';
            showResult(resultDiv, `Error: ${error.message}`, 'error');
        }
    }, 300);
}

function selectSuggestion(postalCode, country) {
    document.getElementById('searchCountry').value = country;
    document.getElementById('searchPostal').value = postalCode;
    document.getElementById('suggestions').style.display = 'none';
    performSearch();
}

// Validation
async function validatePostalCode() {
    const country = document.getElementById('validateCountry').value.trim();
    const postalCode = document.getElementById('validatePostal').value.trim();
    const resultDiv = document.getElementById('validateResult');
    
    if (!country || !postalCode) {
        showResult(resultDiv, 'Please enter both country code and postal code', 'error');
        return;
    }
    
    showResult(resultDiv, 'Validating...', 'loading');
    
    try {
        const response = await fetch(`${API_BASE}/validate?country=${country}&postalCode=${encodeURIComponent(postalCode)}`);
        const isValid = await response.text();
        const result = {
            valid: isValid === 'true',
            country,
            postalCode,
            message: isValid === 'true' ? '✅ Valid postal code' : '❌ Invalid postal code'
        };
        showResult(resultDiv, JSON.stringify(result, null, 2), 'success');
    } catch (error) {
        showResult(resultDiv, `Error: ${error.message}`, 'error');
    }
}

// Batch processing
async function performBatchSearch() {
    const batchInput = document.getElementById('batchInput').value.trim();
    const resultDiv = document.getElementById('batchResult');
    
    if (!batchInput) {
        showResult(resultDiv, 'Please enter JSON input for batch processing', 'error');
        return;
    }
    
    try {
        JSON.parse(batchInput); // Validate JSON
    } catch (error) {
        showResult(resultDiv, `Invalid JSON: ${error.message}`, 'error');
        return;
    }
    
    showResult(resultDiv, 'Processing batch...', 'loading');
    
    try {
        const response = await fetch(`${API_BASE}/lookup/batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: batchInput
        });
        const data = await response.json();
        showResult(resultDiv, JSON.stringify(data, null, 2), response.ok ? 'success' : 'error');
    } catch (error) {
        showResult(resultDiv, `Error: ${error.message}`, 'error');
    }
}

// Statistics
async function getStats() {
    const resultDiv = document.getElementById('statsResult');
    showResult(resultDiv, 'Loading statistics...', 'loading');
    
    try {
        const response = await fetch(`${API_BASE}/stats`);
        const data = await response.json();
        showResult(resultDiv, JSON.stringify(data, null, 2), 'success');
    } catch (error) {
        showResult(resultDiv, `Error: ${error.message}`, 'error');
    }
}

// Utility function to show results
function showResult(element, content, type) {
    element.className = `result ${type}`;
    if (type === 'loading') {
        element.innerHTML = `<div class="loading-spinner"></div> ${content}`;
    } else {
        element.textContent = content;
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    checkHealth();
    getStats();
    
    // Set up event listeners
    document.getElementById('searchBtn').addEventListener('click', performSearch);
    document.getElementById('validateBtn').addEventListener('click', validatePostalCode);
    document.getElementById('batchBtn').addEventListener('click', performBatchSearch);
    document.getElementById('suggestPartial').addEventListener('input', getSuggestions);
    
    // Set up some example data
    document.getElementById('batchInput').value = JSON.stringify({
        searches: [
            { country: "US", postalCode: "90210" },
            { country: "CA", postalCode: "M5V 3A8" },
            { country: "GB", postalCode: "SW1A 1AA" },
            { country: "DE", postalCode: "10115" },
            { country: "FR", postalCode: "75001" }
        ]
    }, null, 2);
    
    // Refresh health every 30 seconds
    setInterval(checkHealth, 30000);
});

// Enter key handlers
document.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const target = e.target;
        if (target.id.includes('search')) performSearch();
        else if (target.id.includes('validate')) validatePostalCode();
    }
}); 