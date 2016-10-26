
git checkout gh-pages

echo "checkout gh-pages"

git merge db-doc

gulp apidoc

git add .
git commit -m"Sync docs"

git subtree push --prefix apidoc origin gh-pages
# git push origin `git subtree split --prefix apidoc gh-pages`:gh-pages --force

echo "Sync the doc successfully."

git checkout db-doc

echo "checkout db-doc"
