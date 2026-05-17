/**
 * Dongtan High School Meal Alerter - Core Application JavaScript Engine
 * Integrates NEIS XML API, handles DOM parsing, and renders high-end custom visuals.
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- Application Constants & Configurations ---
    const API_BASE_URL = 'https://open.neis.go.kr/hub/mealServiceDietInfo';
    const ATPT_CODE = 'J10';        // 경기도교육청 (Gyeonggi-do Office of Education)
    const SCHOOL_CODE = '7530074';   // 화성동탄고등학교 (Dongtan High School)

    // --- State Variables ---
    let currentDate = new Date(); // Starts at today's local system date
    let mealsData = {
        breakfast: null,
        lunch: null,
        dinner: null
    };

    // --- DOM Elements Cache ---
    const datePicker = document.getElementById('date-picker');
    const dateDisplayText = document.getElementById('date-display-text');
    const dayBadge = document.getElementById('day-badge');
    const btnPrev = document.getElementById('btn-prev');
    const btnNext = document.getElementById('btn-next');
    const btnToday = document.getElementById('btn-today');
    
    const toggleAllergens = document.getElementById('toggle-allergens');
    const toggleOrigins = document.getElementById('toggle-origins');
    
    const mealsSkeleton = document.getElementById('meals-skeleton');
    const mealsStatus = document.getElementById('meals-status');
    const statusTitle = document.getElementById('status-title');
    const statusDesc = document.getElementById('status-desc');
    const mealsGrid = document.getElementById('meals-grid');
    
    const cardBf = document.getElementById('meal-breakfast');
    const cardLn = document.getElementById('meal-lunch');
    const cardDn = document.getElementById('meal-dinner');
    
    const autoOriginsSection = document.getElementById('auto-origins-section');
    const autoOriginsContent = document.getElementById('auto-origins-content');

    // Modals
    const nutritionModal = document.getElementById('nutrition-modal');
    const modalNutritionGrid = document.getElementById('modal-nutrition-grid');
    const modalCalorieVal = document.getElementById('modal-calorie-val');
    const modalMealBadge = document.getElementById('modal-meal-badge');
    const btnNutritionClose = document.getElementById('modal-nutrition-close');

    const originModal = document.getElementById('origin-modal');
    const modalOriginGrid = document.getElementById('modal-origin-grid');
    const modalOriginBadge = document.getElementById('modal-origin-badge');
    const btnOriginClose = document.getElementById('modal-origin-close');

    // --- Helper Utilities ---

    /**
     * Formats Date object into YYYY-MM-DD string
     */
    function formatDateToInputString(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /**
     * Formats Date object into YYYYMMDD string for NEIS API
     */
    function formatDateToApiString(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}${month}${day}`;
    }

    /**
     * Formats Date object into a readable Korean date format
     */
    function formatKoreanDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}년 ${month}월 ${day}일`;
    }

    /**
     * Gets Korean day name string from date
     */
    function getKoreanDayName(date) {
        const days = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
        return days[date.getDay()];
    }

    /**
     * Parses custom multi-line text strings (separated by <br/> or \n) into structured Key-Value arrays
     */
    function parseInfoString(str) {
        if (!str) return [];
        // Replace escaped br tags, split by br tags or newlines
        const rawItems = str.split(/<br\s*\/?>|\n/i);
        return rawItems
            .map(item => {
                // Remove NBSP and extra spacing
                const cleaned = item.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
                if (!cleaned) return null;
                
                // Key-value split by colon (e.g. "단백질(g) : 34.2" or "쇠고기 : 국내산")
                const splitIndex = cleaned.indexOf(':');
                if (splitIndex !== -1) {
                    const key = cleaned.substring(0, splitIndex).trim();
                    const value = cleaned.substring(splitIndex + 1).trim();
                    return { key, value };
                }
                return { key: cleaned, value: '' };
            })
            .filter(item => item !== null && item.key !== '');
    }

    /**
     * Cleans allergen indicators from dish names and returns separate name and allergen fields
     */
    function extractAllergenInfo(dishName) {
        // Regex matches parentheses containing numbers separated by periods (e.g., "(1.5.6.13)")
        const allergenRegex = /\s*\(([\d\.]+)\)/;
        const match = dishName.match(allergenRegex);
        
        if (match) {
            const nameOnly = dishName.replace(allergenRegex, '').trim();
            const allergenNumbers = match[1];
            return { name: nameOnly, allergens: allergenNumbers };
        }
        return { name: dishName.trim(), allergens: null };
    }

    // --- Core Application Logic ---

    /**
     * Updates the main calendar displays and synchronization
     */
    function updateDateDisplay() {
        const dateStr = formatDateToInputString(currentDate);
        datePicker.value = dateStr;
        dateDisplayText.textContent = formatKoreanDate(currentDate);
        
        const dayName = getKoreanDayName(currentDate);
        dayBadge.textContent = dayName;
        
        // Style weekend labels
        if (currentDate.getDay() === 0) { // Sunday
            dayBadge.className = 'badge badge-day bg-red';
            dayBadge.style.backgroundColor = 'var(--color-dn)';
        } else if (currentDate.getDay() === 6) { // Saturday
            dayBadge.className = 'badge badge-day bg-blue';
            dayBadge.style.backgroundColor = 'var(--color-ln)';
        } else {
            dayBadge.className = 'badge badge-day';
            dayBadge.style.backgroundColor = 'var(--color-accent)';
        }
    }

    /**
     * Fetches and parses school meals for the currently set currentDate
     */
    async function loadMealsData() {
        // Reset state
        mealsData = { breakfast: null, lunch: null, dinner: null };
        
        // Show Skeleton screens, hide main boards
        mealsSkeleton.classList.remove('hidden');
        mealsGrid.classList.add('hidden');
        mealsStatus.classList.add('hidden');
        autoOriginsSection.classList.add('hidden');

        const ymd = formatDateToApiString(currentDate);
        const requestUrl = `${API_BASE_URL}?ATPT_OFCDC_SC_CODE=${ATPT_CODE}&SD_SCHUL_CODE=${SCHOOL_CODE}&MLSV_YMD=${ymd}`;

        try {
            const response = await fetch(requestUrl);
            if (!response.ok) {
                throw new Error('API 네트워크 통신 장애가 발생했습니다.');
            }
            
            const xmlText = await response.text();
            
            // XML parsing using window.DOMParser
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
            
            // Check for API errors in the XML response
            const errorCodeTag = xmlDoc.getElementsByTagName('code')[0];
            if (errorCodeTag && errorCodeTag.textContent !== 'INFO-000') {
                // If there's an API code that isn't success (like no data found: INFO-200)
                showEmptyState('식단표 데이터가 존재하지 않습니다', '해당 날짜는 급식을 운영하지 않는 주말, 공휴일이거나 아직 식단이 등록되지 않았습니다.');
                return;
            }

            const rows = xmlDoc.getElementsByTagName('row');
            if (rows.length === 0) {
                showEmptyState('식단표 데이터가 없습니다', '선택하신 날짜에는 등록된 급식 정보가 없거나 휴업일입니다.');
                return;
            }

            // Successfully fetched rows! Let's map them to our breakfast, lunch, dinner slots
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                
                // Get standard meal parameters
                const mealName = row.getElementsByTagName('MMEAL_SC_NM')[0]?.textContent || '';
                const calorieInfo = row.getElementsByTagName('CAL_INFO')[0]?.textContent || '--';
                const dishRaw = row.getElementsByTagName('DDISH_NM')[0]?.textContent || '';
                const nutritionRaw = row.getElementsByTagName('NTR_INFO')[0]?.textContent || '';
                const originRaw = row.getElementsByTagName('ORPLC_INFO')[0]?.textContent || '';

                // Map to slots (조식, 중식, 석식)
                const mealObject = {
                    name: mealName,
                    calories: calorieInfo,
                    dishes: parseDishes(dishRaw),
                    nutrition: parseInfoString(nutritionRaw),
                    origins: parseInfoString(originRaw)
                };

                if (mealName.includes('조식')) {
                    mealsData.breakfast = mealObject;
                } else if (mealName.includes('중식')) {
                    mealsData.lunch = mealObject;
                } else if (mealName.includes('석식')) {
                    mealsData.dinner = mealObject;
                }
            }

            renderMealsBoard();

        } catch (error) {
            console.error('API Fetching / Parsing Error:', error);
            showEmptyState('데이터 연동 중 오류 발생', '전국 교육청 나이스 서버와의 데이터 연동 과정에서 일시적 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.');
        }
    }

    /**
     * Splits raw dish text into individual cleaned dishes
     */
    function parseDishes(dishText) {
        if (!dishText) return [];
        // Dishes are separated by br tags
        const rawDishes = dishText.split(/<br\s*\/?>/i);
        return rawDishes
            .map(d => d.replace(/&nbsp;/g, ' ').trim())
            .filter(d => d !== '');
    }

    /**
     * Formats and draws the parsed meal data onto DOM cards
     */
    function renderMealsBoard() {
        // Toggle skeletons
        mealsSkeleton.classList.add('hidden');
        mealsGrid.classList.remove('hidden');

        // Check if absolutely no meal is active at all
        if (!mealsData.breakfast && !mealsData.lunch && !mealsData.dinner) {
            showEmptyState('등록된 급식이 없습니다', '해당 일자에는 조식, 중식, 석식이 모두 계획되어 있지 않습니다.');
            return;
        }

        // Render card helpers
        renderMealCard(cardBf, mealsData.breakfast, 'breakfast');
        renderMealCard(cardLn, mealsData.lunch, 'lunch');
        renderMealCard(cardDn, mealsData.dinner, 'dinner');

        // Render automatic origins panel if checked
        updateAutoOriginsPanel();
    }

    /**
     * Draws a single meal slot card
     */
    function renderMealCard(cardElement, mealData, typeKey) {
        const dishListContainer = cardElement.querySelector('.dish-list');
        const calorieValContainer = cardElement.querySelector('.calorie-val');
        
        // Remove empty state classes
        cardElement.classList.remove('meal-card-empty');

        if (!mealData) {
            // This meal slot is empty for the day
            cardElement.classList.add('meal-card-empty');
            calorieValContainer.textContent = '--';
            dishListContainer.innerHTML = `
                <li class="empty-li" style="border:none; background:rgba(255,255,255,0.01); color:var(--text-muted); justify-content:center; text-align:center;">
                    배식 정보 없음
                </li>
            `;
            // Disable footer actions
            cardElement.querySelectorAll('.footer-btn').forEach(btn => btn.setAttribute('disabled', 'true'));
            return;
        }

        // Enable footer buttons
        cardElement.querySelectorAll('.footer-btn').forEach(btn => btn.removeAttribute('disabled'));

        // Render calorie count
        const calorieClean = mealData.calories.replace(/kcal/gi, '').trim();
        calorieValContainer.textContent = calorieClean;

        // Render dishes list
        let htmlList = '';
        mealData.dishes.forEach(dish => {
            const { name, allergens } = extractAllergenInfo(dish);
            
            const allergenHtml = allergens 
                ? `<span class="allergen-tag ${toggleAllergens.checked ? '' : 'hidden'}" title="알레르기 유발 유발인자: ${allergens}">${allergens}</span>`
                : '';
                
            htmlList += `
                <li>
                    <span class="dish-name">${name}</span>
                    ${allergenHtml}
                </li>
            `;
        });
        dishListContainer.innerHTML = htmlList;
    }

    /**
     * Renders a custom full empty state view
     */
    function showEmptyState(title, description) {
        mealsSkeleton.classList.add('hidden');
        mealsGrid.classList.add('hidden');
        autoOriginsSection.classList.add('hidden');
        
        statusTitle.textContent = title;
        statusDesc.textContent = description;
        mealsStatus.classList.remove('hidden');
    }

    /**
     * Dynamic origins layout generator
     */
    function updateAutoOriginsPanel() {
        if (!toggleOrigins.checked) {
            autoOriginsSection.classList.add('hidden');
            return;
        }

        let hasOrigins = false;
        let columnsHtml = '';

        const mealKeys = [
            { key: 'breakfast', label: '아침 (조식)', badgeClass: 'badge-bf' },
            { key: 'lunch', label: '점심 (중식)', badgeClass: 'badge-ln' },
            { key: 'dinner', label: '저녁 (석식)', badgeClass: 'badge-dn' }
        ];

        mealKeys.forEach(m => {
            const meal = mealsData[m.key];
            if (meal && meal.origins && meal.origins.length > 0) {
                hasOrigins = true;
                
                let listHtml = '';
                meal.origins.forEach(item => {
                    listHtml += `
                        <div style="display:flex; justify-content:space-between; padding: 6px 0; font-size: 0.85rem; border-bottom:1px solid rgba(255,255,255,0.02)">
                            <span style="font-weight:600; color:var(--text-primary);">${item.key}</span>
                            <span style="color:var(--color-success); font-weight:700;">${item.value}</span>
                        </div>
                    `;
                });

                columnsHtml += `
                    <div class="origin-category-box">
                        <h4>
                            <span class="meal-badge ${m.badgeClass}">${m.key === 'breakfast' ? '조식' : m.key === 'lunch' ? '중식' : '석식'}</span>
                            ${m.label} 원산지
                        </h4>
                        <div style="display:flex; flex-direction:column; margin-top:8px;">
                            ${listHtml}
                        </div>
                    </div>
                `;
            } else {
                columnsHtml += `
                    <div class="origin-category-box" style="opacity: 0.5;">
                        <h4>
                            <span class="meal-badge" style="background:rgba(255,255,255,0.05); color:var(--text-muted);">${m.key === 'breakfast' ? '조식' : m.key === 'lunch' ? '중식' : '석식'}</span>
                            ${m.label}
                        </h4>
                        <div style="text-align:center; padding: 20px 0; font-size: 0.85rem; color:var(--text-muted);">
                            원산지 정보가 존재하지 않습니다.
                        </div>
                    </div>
                `;
            }
        });

        if (hasOrigins) {
            autoOriginsContent.innerHTML = columnsHtml;
            autoOriginsSection.classList.remove('hidden');
        } else {
            autoOriginsSection.classList.add('hidden');
        }
    }

    // --- Modal Managers ---

    /**
     * Opens and loads the nutrition information overlay modal
     */
    function openNutritionModal(mealKey) {
        const meal = mealsData[mealKey];
        if (!meal) return;

        // Set meal type visual badge
        const badgeClasses = { breakfast: 'badge-bf', lunch: 'badge-ln', dinner: 'badge-dn' };
        modalMealBadge.className = `meal-badge ${badgeClasses[mealKey]}`;
        modalMealBadge.textContent = mealKey === 'breakfast' ? '조식' : mealKey === 'lunch' ? '중식' : '석식';
        
        // Calorie
        const calorieClean = meal.calories.replace(/kcal/gi, '').trim();
        modalCalorieVal.textContent = calorieClean;

        // Build grid list of nutrient quantities
        let gridHtml = '';
        if (meal.nutrition && meal.nutrition.length > 0) {
            meal.nutrition.forEach(nutr => {
                gridHtml += `
                    <div class="nutrition-item">
                        <span class="nutr-name">${nutr.key}</span>
                        <span class="nutr-val">${nutr.value}</span>
                    </div>
                `;
            });
        } else {
            gridHtml = `<div style="grid-column: span 2; text-align:center; color:var(--text-secondary); padding: 20px;">상세 영양 성분 정보가 제공되지 않는 식단입니다.</div>`;
        }
        
        modalNutritionGrid.innerHTML = gridHtml;
        nutritionModal.classList.remove('hidden');
        document.body.style.overflow = 'hidden'; // Lock background scrolling
    }

    /**
     * Opens and loads the ingredient origins overlay modal
     */
    function openOriginModal(mealKey) {
        const meal = mealsData[mealKey];
        if (!meal) return;

        // Set type badge
        const badgeClasses = { breakfast: 'badge-bf', lunch: 'badge-ln', dinner: 'badge-dn' };
        modalOriginBadge.className = `meal-badge ${badgeClasses[mealKey]}`;
        modalOriginBadge.textContent = mealKey === 'breakfast' ? '조식' : mealKey === 'lunch' ? '중식' : '석식';

        // Build list
        let listHtml = '';
        if (meal.origins && meal.origins.length > 0) {
            meal.origins.forEach(origin => {
                listHtml += `
                    <div class="origin-item-row">
                        <span class="origin-ingredient">${origin.key}</span>
                        <span class="origin-country">${origin.value}</span>
                    </div>
                `;
            });
        } else {
            listHtml = `<div style="text-align:center; color:var(--text-secondary); padding: 20px;">원산지 표기 정보가 제공되지 않는 식단입니다.</div>`;
        }

        modalOriginGrid.innerHTML = listHtml;
        originModal.classList.remove('hidden');
        document.body.style.overflow = 'hidden'; // Lock background scroll
    }

    // --- Interactive Control Hooks & Event Listeners ---

    // Next day click
    btnNext.addEventListener('click', () => {
        currentDate.setDate(currentDate.getDate() + 1);
        updateDateDisplay();
        loadMealsData();
    });

    // Previous day click
    btnPrev.addEventListener('click', () => {
        currentDate.setDate(currentDate.getDate() - 1);
        updateDateDisplay();
        loadMealsData();
    });

    // Go to system today's date click
    btnToday.addEventListener('click', () => {
        currentDate = new Date();
        updateDateDisplay();
        loadMealsData();
    });

    // DatePicker change selector
    datePicker.addEventListener('change', (e) => {
        if (e.target.value) {
            currentDate = new Date(e.target.value);
            updateDateDisplay();
            loadMealsData();
        }
    });

    // Toggle allergen text filters
    toggleAllergens.addEventListener('change', () => {
        const allergenTags = document.querySelectorAll('.allergen-tag');
        allergenTags.forEach(tag => {
            if (toggleAllergens.checked) {
                tag.classList.remove('hidden');
            } else {
                tag.classList.add('hidden');
            }
        });
    });

    // Toggle auto-origins visibility panel
    toggleOrigins.addEventListener('change', () => {
        updateAutoOriginsPanel();
    });

    // Hook click listeners for card footer detail launchers
    document.addEventListener('click', (e) => {
        const nutritionBtn = e.target.closest('.btn-view-nutrition');
        if (nutritionBtn) {
            const mealKey = nutritionBtn.getAttribute('data-meal');
            openNutritionModal(mealKey);
            return;
        }

        const originBtn = e.target.closest('.btn-view-origin');
        if (originBtn) {
            const mealKey = originBtn.getAttribute('data-meal');
            openOriginModal(mealKey);
            return;
        }
    });

    // Close modals
    function closeAllModals() {
        nutritionModal.classList.add('hidden');
        originModal.classList.add('hidden');
        document.body.style.overflow = 'auto'; // Unlock background scroll
    }

    btnNutritionClose.addEventListener('click', closeAllModals);
    btnOriginClose.addEventListener('click', closeAllModals);

    // Close by overlay click
    window.addEventListener('click', (e) => {
        if (e.target === nutritionModal || e.target === originModal) {
            closeAllModals();
        }
    });

    // Close modals by pressing Escape key
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeAllModals();
        }
    });

    // --- Application Bootstrapping (Initialization) ---
    updateDateDisplay();
    loadMealsData();
});
