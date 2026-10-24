import { Component, inject } from '@angular/core';
import { DataService } from '../../services/data-service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatGridListModule } from '@angular/material/grid-list';
import { ActivatedRoute, Params, Router, RouterModule } from '@angular/router';

@Component({
  selector: 'app-tv',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatInputModule,
    MatListModule,
    MatIconModule,
    MatGridListModule,
    RouterModule,
  ],
  templateUrl: './tv.html',
  styleUrl: './tv.css',
})
export class Tv {
  router = inject(Router);
  public filteredData: any;
  public allData: any;
  searchTerm = '';
  cols = 8;
  path = '';

  constructor(
    private dataService: DataService,
    private route: ActivatedRoute,
  ) {
    this.path = this.router.url.split('/')[1];
  }

  ngOnInit() {
    if (this.path === 'tv') {
      this.dataService.getTVCategories().subscribe({
        next: (data) => {
          this.filteredData = data.filter((item) => {
            const name = item.category_name.toUpperCase();
            item.category_name = name.replace(/[\p{No}\p{Lm}ᴴᴰ\s\/]+$/gu, '').trim();
            return name.startsWith('CA') || name.startsWith('US') || name.startsWith('WT');
          });
          this.allData = this.filteredData;
        },
      });
    } else if (this.path === 'movies') {
      this.dataService.getMovieCategories().subscribe({
        next: (data) => {
          this.filteredData = data.filter((item) => {
            let name = item.category_name.toUpperCase();
            item.category_name = name.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹ᴷᴾᴰᴼᴸᴮʸᴬᵁᴵᴴᴰ\s\/]+$/g, '').trim();
            return name;
          });
          this.allData = this.filteredData;
        },
      });
    } else {
      this.dataService.getSeriesCategories().subscribe({
        next: (data) => {
          this.filteredData = data.filter((item) => {
            let name = item.category_name.toUpperCase();
            item.category_name = name.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹ᴷᴾᴰᴼᴸᴮʸᴬᵁᴵᴴᴰ\s\/]+$/g, '').trim();
            return name;
          });
          this.allData = this.filteredData;
        },
      });
    }
  }

  filterCategories() {
    const term = this.searchTerm.toLowerCase();
    this.filteredData = this.allData.filter((cat: { category_name: string }) =>
      cat.category_name.toLowerCase().includes(term),
    );
  }

  onCategoryClick(category: any) {
    if (this.path === 'tv') {
      this.router.navigate(['/tv', category.category_id]);
    }
    else if (this.path === 'movies') {
      this.router.navigate(['/movies', category.category_id]);
    } else {
      this.router.navigate(['/shows', category.category_id]);
    }
  }
}
