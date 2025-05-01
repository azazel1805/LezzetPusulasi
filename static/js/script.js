document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('recipe-form');
    const ingredientsInput = document.getElementById('ingredients');
    const regionSelect = document.getElementById('region');
    const submitButton = document.getElementById('submit-button');
    const loadingIndicator = document.getElementById('loading');
    const errorMessageDiv = document.getElementById('error-message');
    const resultArea = document.getElementById('result-area');
    const recipeTitle = document.getElementById('recipe-title');
    const recipeIngredientsList = document.getElementById('recipe-ingredients');
    const recipeInstructions = document.getElementById('recipe-instructions');
    const recipeNote = document.getElementById('recipe-note');
    const saveRecipeButton = document.getElementById('save-recipe');
    const saveStatus = document.getElementById('save-status');
    const savedRecipesListDiv = document.getElementById('saved-recipes-list');
    const clearSavedButton = document.getElementById('clear-saved-recipes');

    let currentRecipeData = null; // To store the currently displayed recipe data for saving

    // --- PWA Service Worker Registration ---
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/static/service-worker.js')
                .then(registration => {
                    console.log('ServiceWorker registration successful with scope: ', registration.scope);
                })
                .catch(error => {
                    console.log('ServiceWorker registration failed: ', error);
                });
        });
    }

    // --- Form Submission Logic ---
    form.addEventListener('submit', async (event) => {
        event.preventDefault(); // Prevent default page reload

        // --- Basic Input Validation ---
        const ingredients = ingredientsInput.value.trim();
        const region = regionSelect.value;

        if (!ingredients) {
            showError("Lütfen malzeme listesini girin.");
            return;
        }
        if (!region) {
            showError("Lütfen bir bölge seçin.");
            return;
        }

        // Split ingredients by comma, trim whitespace from each
        const ingredientsArray = ingredients.split(',')
                                        .map(item => item.trim())
                                        .filter(item => item !== ''); // Remove empty strings

        if (ingredientsArray.length === 0) {
             showError("Lütfen geçerli malzemeler girin.");
             return;
        }

        // --- UI Updates: Start Loading ---
        hideError();
        resultArea.style.display = 'none'; // Hide previous results
        saveRecipeButton.style.display = 'none'; // Hide save button
        saveStatus.textContent = ''; // Clear save status
        loadingIndicator.style.display = 'block';
        submitButton.disabled = true;
        submitButton.textContent = 'Oluşturuluyor...';

        // --- API Call ---
        try {
            const response = await fetch('/api/generate-recipe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ingredients: ingredientsArray,
                    region: region
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                // Handle errors specifically sent from the backend
                throw new Error(data.error || `HTTP error! status: ${response.status}`);
            }

            // --- Display Results ---
            displayRecipe(data.recipe);
            currentRecipeData = data.recipe; // Store for potential saving
            resultArea.style.display = 'block';
            saveRecipeButton.style.display = 'block'; // Show save button

        } catch (error) {
            console.error('Error fetching recipe:', error);
            showError(`Tarif alınırken bir hata oluştu: ${error.message}`);
            resultArea.style.display = 'none'; // Hide result area on error
        } finally {
            // --- UI Updates: End Loading ---
            loadingIndicator.style.display = 'none';
            submitButton.disabled = false;
            submitButton.textContent = '✨ Tarif Oluştur';
        }
    });

    // --- Helper Functions ---
    function showError(message) {
        errorMessageDiv.textContent = message;
        errorMessageDiv.style.display = 'block';
    }

    function hideError() {
        errorMessageDiv.textContent = '';
        errorMessageDiv.style.display = 'none';
    }

    function displayRecipe(recipe) {
        recipeTitle.textContent = recipe.title || "Başlıksız Tarif";
        recipeInstructions.textContent = recipe.instructions || "Hazırlanış bilgisi bulunamadı.";
        recipeNote.textContent = recipe.regional_note || "Bölgesel not bulunamadı.";

        // Clear previous ingredients
        recipeIngredientsList.innerHTML = '';

        // Populate ingredients list
        if (recipe.ingredients && recipe.ingredients.length > 0) {
            recipe.ingredients.forEach(item => {
                const li = document.createElement('li');
                li.textContent = item;
                recipeIngredientsList.appendChild(li);
            });
        } else {
            const li = document.createElement('li');
            li.textContent = "Malzeme listesi alınamadı.";
            recipeIngredientsList.appendChild(li);
        }
    }


     // --- Offline Recipe Saving (Using LocalStorage) ---
     const SAVED_RECIPES_KEY = 'yoreselTarifler';

     function getSavedRecipes() {
         return JSON.parse(localStorage.getItem(SAVED_RECIPES_KEY) || '[]');
     }

     function saveRecipeToLocalStorage(recipe) {
         const savedRecipes = getSavedRecipes();
         // Simple check to avoid duplicates based on title (could be more robust)
         if (!savedRecipes.some(r => r.title === recipe.title)) {
            // Add a timestamp for potential sorting later
            recipe.savedAt = new Date().toISOString();
            savedRecipes.push(recipe);
            localStorage.setItem(SAVED_RECIPES_KEY, JSON.stringify(savedRecipes));
             return true; // Indicate success
         }
         return false; // Indicate duplicate/failure
     }

     function loadSavedRecipes() {
         const savedRecipes = getSavedRecipes();
         savedRecipesListDiv.innerHTML = ''; // Clear current list

         if (savedRecipes.length === 0) {
             savedRecipesListDiv.innerHTML = '<p>Henüz kaydedilmiş tarif yok.</p>';
             clearSavedButton.style.display = 'none';
         } else {
             savedRecipes.forEach((recipe, index) => {
                 const recipeDiv = document.createElement('div');
                 recipeDiv.textContent = recipe.title || 'İsimsiz Kayıtlı Tarif';
                 recipeDiv.dataset.index = index; // Store index to retrieve full data
                 recipeDiv.title = 'Tarifi Görüntüle'; // Tooltip
                 recipeDiv.addEventListener('click', () => {
                     displayRecipe(recipe); // Display the clicked saved recipe
                     resultArea.style.display = 'block'; // Show the result area
                     currentRecipeData = recipe; // Set current recipe for potential re-saving (though unlikely needed)
                     saveRecipeButton.style.display = 'block'; // Show save button (might be confusing here?) - Optional: hide it for saved ones
                     saveStatus.textContent = 'Kaydedilmiş tarif görüntülendi.';
                     window.scrollTo(0, resultArea.offsetTop - 20); // Scroll to the recipe
                 });
                 savedRecipesListDiv.appendChild(recipeDiv);
             });
             clearSavedButton.style.display = 'block';
         }
     }

     saveRecipeButton.addEventListener('click', () => {
         if (currentRecipeData) {
             const success = saveRecipeToLocalStorage(currentRecipeData);
             if (success) {
                 saveStatus.textContent = 'Tarif başarıyla kaydedildi!';
                 loadSavedRecipes(); // Refresh the saved list
             } else {
                  saveStatus.textContent = 'Bu tarif zaten kaydedilmiş.';
             }
             // Optional: disable button after saving?
             // saveRecipeButton.disabled = true;
         } else {
             saveStatus.textContent = 'Kaydedilecek tarif bulunamadı.';
         }
     });

    clearSavedButton.addEventListener('click', () => {
        if (confirm('Tüm kaydedilmiş tarifleri silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.')) {
            localStorage.removeItem(SAVED_RECIPES_KEY);
            loadSavedRecipes(); // Refresh the list (will show empty message)
            saveStatus.textContent = 'Tüm kayıtlı tarifler silindi.';
        }
    });

     // Load saved recipes when the page loads
     loadSavedRecipes();

}); // End DOMContentLoaded