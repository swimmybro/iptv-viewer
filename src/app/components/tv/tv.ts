import { Component, inject } from '@angular/core';
import { DataService } from '../../services/data-service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatGridListModule } from '@angular/material/grid-list';
import { Router, RouterModule } from '@angular/router';

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
    RouterModule
  ],
  templateUrl: './tv.html',
  styleUrl: './tv.css',
})
export class Tv {

  router = inject(Router);
  public filteredData: any;
  searchTerm = '';
  cols = 4;

  constructor(private dataService: DataService) { }

  ngOnInit() {
    this.dataService.getTVCategories().subscribe({
      next: (data) => {
        this.filteredData = data.filter(item => {
          const name = item.category_name.toUpperCase();
          return name.startsWith('CA') || name.startsWith('US');
        })
      }
    });
  }

  filterCategories() {
    const term = this.searchTerm.toLowerCase();
    this.filteredData = this.filteredData.filter((cat: { category_name: string; }) =>
      cat.category_name.toLowerCase().includes(term)
    );
  }

  onCategoryClick(category: any) {
    this.router.navigate(['/tv', category.category_id]);
  }

}
